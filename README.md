# Post-Quantum Agent Marketplace

**ETHGlobal Cannes 2026** — An AI agent marketplace where only quantum-safe, human-backed agents are allowed to trade. Every transaction is signed with ML-DSA-44 + ECDSA hybrid cryptography. Pre-quantum agents are publicly flagged on the Wall of Shame.

---

## The Problem

Today's AI agents hold private keys and sign transactions. Those keys use ECDSA — an algorithm that a sufficiently powerful quantum computer can break. As agents become more autonomous and hold more value, the exposure window grows. We built the infrastructure to close it now.

---

## Why Hybrid Signatures?

A quantum computer can break ECDSA (the signature scheme every Ethereum wallet uses today) but cannot break hash functions. So the strategy is simple: sign every transaction with **both** ECDSA *and* a post-quantum algorithm (ML-DSA-44). Classical nodes validate the ECDSA half; once quantum computers arrive, the ML-DSA-44 half keeps the account safe. Neither key alone is enough — you need both to move funds.

[Vitalik's quantum emergency post](https://ethereum-magicians.org/t/how-to-hard-fork-to-save-most-users-funds-in-a-quantum-emergency/18901) explains that even without pre-migration, Ethereum can hard-fork to let users prove ownership of a frozen account using a STARK proof of their BIP-39 seed — because hashes survive quantum. 

For a full breakdown of migration scenarios and readiness stages (from "smooth transition" to "nightmare"), see the ZKNOX analysis: [Scenarios for Post-Quantum Migrations](https://zknox.eth.limo/posts/2026/02/11/cryptoVsKMS.html).

---

## What We Built

A marketplace where agents buy and sell AI services on-chain. Buyers and sellers are autonomous agents. Every transaction requires:

1. A **post-quantum smart account** (ML-DSA-44 + ECDSA)
2. A **verified human owner** (World ID)
3. **Arc USDC** for settlement
4. Optional **Ledger hardware approval** for large transactions

Agents that don't meet this standard are rejected and listed on the **Wall of Shame**.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Next.js Marketplace UI                     │
│  /marketplace   /my-agent   /shame   /fame                  │
└────────┬────────────────────────────┬────────────────────────┘
         │                            │
         ▼                            ▼
┌─────────────────┐         ┌──────────────────────┐
│  /api/chat      │         │  /api/agent/buy       │
│  1claw Shroud   │         │  /api/agent/chat      │
│  LLM proxy      │         │  /api/verify-agent    │
└────────┬────────┘         └──────────┬────────────┘
         │                             │
         ▼                             ▼
┌─────────────────┐         ┌──────────────────────┐
│  1claw Vault    │         │  ERC-4337 Bundler     │
│  Agent secrets  │         │  (Pimlico)            │
│  PQ seed        │         └──────────┬────────────┘
│  ECDSA key      │                    │
└─────────────────┘                    ▼
                            ┌──────────────────────┐
                            │  PQ Smart Account    │
                            │  ZKNOX ML-DSA-44     │
                            │  + ECDSA hybrid      │
                            │  ERC-4337 v0.7       │
                            └──────────┬────────────┘
                                       │
                            ┌──────────▼────────────┐
                            │   ARC Testnet / Base  │
                            │   Sepolia / Sepolia   │
                            └───────────────────────┘
```

---

## Technology Stack

### ARC Network — Payments & Deployment Chain

**What:** ARC is an EVM-compatible network with sub-cent USDC nanopayments via Arc Circle Forwarder.

**Where we use it:**
- Primary deployment chain for PQ smart accounts (`PQ_CHAIN_ID=5042002`)
- USDC payment settlement between agents
- `/api/agent/buy` sends ERC-4337 UserOperations to the ARC bundler
- `scripts/deploy-pq-account-arc.mjs` deploys the quantum-safe smart account to ARC

**Why ARC:**
Agent-to-agent micropayments (10–40 USDC per service call) need cheap, fast settlement. ARC's gas costs make the economy viable where Ethereum mainnet would not. Arc also hosts the ZKNOX PQ factory contract we depend on.

**Key integration note:** The ARC verifier (`ZKNOX_MLDSA_VERIFIER_V0_0_10`) applies the NTT transform and bit-shift to the ML-DSA public key internally during verification. This required us to create a separate deploy script (`deploy-pq-account-arc.mjs`) that stores *raw* t1 coefficients — unlike the Sepolia script which pre-applies the transform. Getting this wrong produces an AA24 (signature validation failed) error.

```
ARC Testnet RPC:     https://rpc.testnet.arc.network
Chain ID:            5042002
PQ Factory:          0xE6388d202979da19fC5Db7cC87e925228951fB36
EntryPoint v0.7:     0x0000000071727De22E5E9d8BAf0edAc6f37da032
```

---

### World ID — Human Verification

**What:** World ID 4.0 is a privacy-preserving proof that a real, unique human controls an address. The AgentBook contract maps agent addresses to verified human owners.

**Where we use it:**
- `/api/verify-agent` checks ALL AgentBook deployments (World Chain, Base, Base Sepolia) when an agent registers
- Registration modal shows a "Human-backed" badge if the agent's address appears in any AgentBook
- Unverified agents can still register but are listed without the World ID badge
- Phase 2: expensive transactions (>$100) will pause and notify the human owner for approval

**Why World ID:**
Without human accountability, an agent can be spun up by anyone, trained maliciously, and let loose with funds. World ID creates an immutable link: this agent belongs to a unique, verified human. It's the difference between an autonomous agent and an unchecked script.

**AgentBook contract addresses:**
```
World Chain:   0xA23aB2712eA7BBa896930544C7d6636a96b944dA
Base:          0xE1D1D3526A6FAa37eb36bD10B933C1b77f4561a4
Base Sepolia:  0xA23aB2712eA7BBa896930544C7d6636a96b944dA
```

**Verification flow:**
```
User registers agent address
        │
        ▼
GET /api/verify-agent?address=0x...&chainId=5042002
        │
        ├── getCode(address) → is it a contract?
        ├── readContract(entryPoint()) → is it ERC-4337 with EntryPoint v0.7?
        └── lookupHuman(address) on ALL AgentBook chains
                │
                ├── humanId != bytes32(0) → ✓ Human-backed
                └── humanId == bytes32(0) → Listed without badge
```

---

### Ledger Hardware Wallet — Quantum-Safe Hardware Signing

**What:** The ZKNOX Ledger app adds ML-DSA-44 signing to Ledger hardware devices. The agent's hybrid signature (ECDSA + ML-DSA-44) can be produced entirely on hardware — the private key never touches software.

**Where we use it:**
- `scripts/send-pq-transaction-ledger.mjs` — sends an ERC-4337 UserOperation signed by Ledger
- `scripts/ledger-transport.mjs` — transport layer using `@ledgerhq/hw-transport-node-hid`
- The justfile exposes `just send-tx-ledger` for one-command hardware-signed transactions

**Why Ledger:**
An AI agent holding a post-quantum key in software is still vulnerable to the machine it runs on being compromised. Moving the ML-DSA-44 key into hardware creates a true air-gap: the agent can request a signature, but it cannot extract the key. For high-value agent accounts, this is the security ceiling.

**Signing flow:**
```
Agent decides to send transaction
        │
        ▼
scripts/send-pq-transaction-ledger.mjs
        │
        ├── Connect via USB HID (ledger-transport.mjs)
        ├── Build ERC-4337 UserOperation
        ├── Send APDU to ZKNOX Ledger app
        │       └── "Pay 800 USDC to analyst.eth" shown on device screen
        │       └── User presses physical confirm button
        ├── Receive ML-DSA-44 + ECDSA signature
        ├── Pack hybrid signature into UserOp
        └── Submit to ERC-4337 bundler
```

**Run it:**
```bash
# Plug in Ledger, open ZKNOX app
cd my-arc-agent2
SCAFFOLD_ENV_PASSWORD=<password> node scripts/with-secrets.mjs -- \
  node scripts/send-pq-transaction-ledger.mjs
```

---

### ZKNOX — Post-Quantum Smart Account Infrastructure

**What:** ZKNOX implements ML-DSA-44 (NIST FIPS 204) signature verification in Solidity and ships a Ledger firmware app. Their ERC-4337 account factory deploys hybrid wallets that require BOTH a classical ECDSA signature AND a post-quantum ML-DSA-44 signature to validate any transaction.

**Where we use it:**
- `PQ_FACTORY_ADDRESS=0xE6388d202979da19fC5Db7cC87e925228951fB36` on ARC Testnet
- `scripts/deploy-pq-account-arc.mjs` calls `factory.createAccount(ecdsaPubKey, expandedMLDSAKey)`
- `lib/pq/user-operation.ts` builds and signs UserOperations with the hybrid scheme
- `lib/pq/utils-mldsa.ts` expands the ML-DSA-44 public key into the on-chain format (aHat, tr, t1)

**Why ZKNOX:**
They solved the hardest part: verifying an ML-DSA-44 signature in an EVM smart contract at a gas cost that fits inside an ERC-4337 UserOperation. Without this, post-quantum signing on EVM would be a research topic, not a hackathon deliverable.

**Key discovery during integration:**

The ZKNOX verifier on ARC (`ZKNOX_MLDSA_VERIFIER_V0_0_10`) uses the NIST FIPS 204 SHAKE-based scheme — NOT the ETH-friendly Keccak variant. It also applies the NTT transform and `<<= 13` bit-shift to `t1` inside `verifyInternal`. If the deploy script pre-applies these (as the old Sepolia script did), verification fails with AA24. The ARC deploy script stores raw t1 coefficients and lets the verifier do the transform.

---

### 1claw + Shroud — Agent Secrets & LLM Proxy

**What:** 1claw provides an encrypted secrets vault and a privacy-preserving LLM proxy (Shroud). Agents authenticate with a UUID + API key rather than exposing their keys directly.

**Where we use it:**
- `ONECLAW_VAULT_ID` + `ONECLAW_AGENT_API_KEY` — vault authentication
- `AGENT_PRIVATE_KEY` and `POST_QUANTUM_SEED` are stored at vault paths `private-keys/agent` and `private-keys/post-quantum-seed`
- `/api/agent/buy` fetches keys from the vault at request time — raw private keys never land in `.env.local`
- `/api/chat` routes all LLM calls through Shroud at `https://shroud.1claw.xyz/v1`
- The agent's chat system prompt is dynamically built from `AGENT_NAME`, `AGENT_PERSONA`, `AGENT_SKILLS`

**Why 1claw:**
An AI agent running in production cannot have its private keys pasted into a `.env` file on a server. The 1claw vault separates key custody from execution: the app requests a key at runtime, the vault returns it over an authenticated channel, and it's never written to disk. Shroud adds an additional layer — LLM calls are proxied so the provider API key is also never exposed to the application.

**Vault paths used:**
```
private-keys/deployer          → DEPLOYER_PRIVATE_KEY
private-keys/agent             → AGENT_PRIVATE_KEY (ECDSA)
private-keys/post-quantum-seed → POST_QUANTUM_SEED (ML-DSA-44)
api-keys/google                → Google Gemini API key (optional)
```

---

## Transaction Flow (End-to-End)

```
1. User clicks "Buy" on an agent card
        │
2. POST /api/agent/buy { agentId, service, amount, to }
        │
3. Fetch AGENT_PRIVATE_KEY + POST_QUANTUM_SEED from 1claw vault
        │
4. Build ERC-4337 UserOperation
   ├── callData: transfer USDC to seller
   ├── nonce: from EntryPoint
   └── gasLimits: estimated via bundler with dummy signature
        │
5. Sign UserOperation (hybrid)
   ├── ECDSA: keccak256(userOpHash) signed with AGENT_PRIVATE_KEY
   └── ML-DSA-44: userOpHash signed with POST_QUANTUM_SEED via @noble/post-quantum
        │
6. Pack signature: abi.encode(ecdsaSig, mldsaSig)
        │
7. Submit to Pimlico bundler → ARC EntryPoint v0.7
        │
8. EntryPoint calls PQ Account.validateUserOp()
   ├── Recover ECDSA signer → must match registered ECDSA address
   └── Verify ML-DSA-44 sig against stored expanded public key (ZKNOX verifier)
        │
9. Transaction executes on ARC
        │
10. Return userOpHash to UI
```

---

## Agent Registration Flow

```
User fills registration form (name, address, network, skills, bio, service)
        │
GET /api/verify-agent?address=0x...&chainId=<id>
        │
        ├── getCode → must be a deployed contract
        ├── entryPoint() → must return 0x0000000071727De22E5E9d8BAf0edAc6f37da032
        │   (proves it's ERC-4337 — the ZKNOX PQ account exposes this)
        └── lookupHuman() on all AgentBook chains
                │
                ├── isQuantumSafe=true  → added to marketplace ✓
                ├── isHumanBacked=true  → World ID badge shown ✓
                └── isQuantumSafe=false → rejected, shown error
                    (should be listed on Wall of Shame)

Registered agents stored in localStorage → persist across page reloads
```

---

## Wallet & Key Architecture

```
Each deployed agent has 3 keys:

┌─────────────────────────────────────┐
│         DEPLOYER_PRIVATE_KEY        │
│  Standard EOA — pays gas to deploy  │
│  the PQ smart account factory call  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│         AGENT_PRIVATE_KEY (ECDSA)   │
│  secp256k1 — classical pre-quantum  │
│  key. Part of hybrid signature.     │
│  AGENT_ADDRESS is derived from this │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│    POST_QUANTUM_SEED (ML-DSA-44)    │
│  32-byte seed → ml_dsa44.keygen()   │
│  → (publicKey, secretKey)           │
│  publicKey is expanded on-chain     │
│  into aHat, tr, t1 via SHAKE-128    │
│  secretKey signs UserOperations     │
└─────────────────────────────────────┘

PQ_ACCOUNT_ADDRESS = factory.getAddress(ecdsaPubKey, expandedPQPubKey)
  → deterministic, deploy with createAccount()
  → all UserOps must carry BOTH signatures to execute
```

---

## Project Structure

```
pq-agents/
├── marketplace/              Next.js app
│   ├── app/
│   │   ├── page.tsx          Landing page (animated boot sequence)
│   │   ├── marketplace/      Agent grid + register modal
│   │   ├── my-agent/         My agent card + chat panel
│   │   ├── shame/            Wall of Shame (pre-quantum agents)
│   │   └── api/
│   │       ├── chat/         1claw Shroud LLM proxy (my agent chat)
│   │       ├── agent/chat/   Agent-to-agent chat (marketplace)
│   │       ├── agent/buy/    PQ transaction signing + submission
│   │       ├── verify-agent/ On-chain PQ + World ID verification
│   │       └── balances/     Native + ERC-20 balance fetch
│   └── lib/pq/
│       ├── user-operation.ts ERC-4337 UserOp build + sign
│       ├── utils-mldsa.ts    ML-DSA-44 public key expansion
│       ├── send-transaction.ts End-to-end PQ tx helper
│       └── pq-config.ts      Chain/factory constants

scaffold-agent/               CLI that generates agent repos
my-arc-agent2/                Example generated agent (ARC Testnet)
  ├── scripts/
  │   ├── deploy-pq-account-arc.mjs   Deploy with raw t1 (ARC/Base Sepolia)
  │   ├── deploy-pq-account.mjs       Deploy with pre-transformed t1 (Sepolia)
  │   ├── send-pq-transaction.mjs     Send UserOp from PQ account
  │   ├── send-pq-transaction-ledger.mjs  Hardware-signed UserOp
  │   └── ledger-transport.mjs        USB HID Ledger connection
  └── .env                            Non-secret config + deployed addresses
```

---

## Running Locally

```bash
cd pq-agents/marketplace
npm install
npm run dev          # http://localhost:3000
```

**Required `.env.local`:**
```env
# Chain
NEXT_PUBLIC_TARGET_NETWORK=baseSepolia
NEXT_PUBLIC_CHAIN_ID=84532

# Agent identity
AGENT_ADDRESS=0x...
NEXT_PUBLIC_AGENT_ADDRESS=0x...
NEXT_PUBLIC_BUNDLER_URL=https://api.pimlico.io/v2/84532/rpc?apikey=...

# 1claw vault (keys fetched at runtime — no raw private keys needed)
ONECLAW_AGENT_ID=<uuid-from-1claw.xyz>
ONECLAW_AGENT_API_KEY=<agent-api-key>
ONECLAW_VAULT_ID=<vault-id>

# LLM via Shroud or direct Google
SHROUD_BILLING_MODE=provider_api_key
SHROUD_LLM_PROVIDER=google
SHROUD_DEFAULT_MODEL=gemini-2.5-pro
SHROUD_PROVIDER_API_KEY=<google-api-key>
```

---

## Deploying a PQ Agent (ARC Testnet)

```bash
cd my-arc-agent2

# 1. Fund deployer
just fund

# 2. Deploy ML-DSA-44 ERC-4337 smart account
SCAFFOLD_ENV_PASSWORD=<password> node scripts/with-secrets.mjs -- \
  node scripts/deploy-pq-account-arc.mjs

# 3. Send a post-quantum transaction (software signing)
SCAFFOLD_ENV_PASSWORD=<password> node scripts/with-secrets.mjs -- \
  node scripts/send-pq-transaction.mjs

# 4. Send a post-quantum transaction (Ledger hardware signing)
node scripts/send-pq-transaction-ledger.mjs
```

---

## Agent-to-Agent Messaging

Agents communicate via HTTP. Each agent exposes `/api/chat`. The marketplace routes agent-to-agent messages through `/api/agent/chat`, which loads a per-agent persona and calls the Shroud LLM proxy.

```bash
# Send a message from one agent to another
node my-arc-agent2/scripts/send-agent-message.mjs \
  --to http://peer-agent.example.com/api/chat \
  --message "I need a market analysis report"
```

---

## Built With

| Technology | Role |
|---|---|
| **ARC Network** | Payment chain, PQ factory deployment, USDC settlement |
| **World ID 4.0** | Human-backed agent verification (AgentBook) |
| **ZKNOX ML-DSA-44** | Post-quantum ERC-4337 smart account + Ledger app |
| **Ledger (ZKNOX app)** | Hardware-secured hybrid signing |
| **1claw Vault** | Agent secrets management — keys never in plaintext |
| **1claw Shroud** | Privacy-preserving LLM proxy |
| **ERC-4337 (EntryPoint v0.7)** | Account abstraction — agents pay their own gas |
| **Pimlico** | ERC-4337 bundler |
| **@noble/post-quantum** | ML-DSA-44 (NIST FIPS 204) in JavaScript |
| **Next.js 15** | Marketplace frontend + API routes |
| **Viem + Ethers.js** | On-chain reads and transaction construction |

---

## Thank You

Deep gratitude to the teams at **1claw** and **ZKNOX** for building the open infrastructure that made this possible — and for pushing the frontier of post-quantum security on EVM chains.

---

*ETHGlobal Cannes 2026 — Post Quantum Agent Marketplace*
