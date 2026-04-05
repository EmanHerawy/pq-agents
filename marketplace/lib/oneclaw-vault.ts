/**
 * 1claw vault helpers — proper SDK usage per docs.1claw.xyz/docs/agent-api/fetch-secret
 *
 * The agent authenticates with its UUID + API key to get a short-lived JWT,
 * then fetches secrets by path. With intents_api_enabled: false the agent can
 * read private_key-type secrets (AGENT_PRIVATE_KEY, POST_QUANTUM_SEED).
 *
 * Keys stored at:
 *   private-keys/agent              → AGENT_PRIVATE_KEY (ECDSA)
 *   private-keys/post-quantum-seed  → POST_QUANTUM_SEED (ML-DSA-44)
 *   private-keys/deployer           → DEPLOYER_PRIVATE_KEY
 */
import { createClient } from "@1claw/sdk";

const BASE_URL =
  (process.env.ONECLAW_API_BASE_URL || "https://api.1claw.xyz").replace(
    /\/$/,
    "",
  );

function normalize(v: string | undefined) {
  let s = (v || "").trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }
  return s === "undefined" || s === "null" ? "" : s;
}

/** Build an authenticated SDK client using the agent's own credentials. */
async function agentClient() {
  const agentId = normalize(process.env.ONECLAW_AGENT_ID);
  const agentKey = normalize(process.env.ONECLAW_AGENT_API_KEY);
  const apiKey = normalize(process.env.ONECLAW_API_KEY);

  const anonClient = createClient({ baseUrl: BASE_URL });

  let token: string;
  if (apiKey) {
    const res = await anonClient.auth.apiKeyToken({ api_key: apiKey });
    if (!res.data) throw new Error("1claw auth failed — no token returned");
    token = res.data.access_token;
  } else if (agentId && agentKey) {
    const res = await anonClient.auth.agentToken({
      agent_id: agentId,
      api_key: agentKey,
    });
    if (!res.data) throw new Error("1claw agent auth failed — no token returned");
    token = res.data.access_token;
  } else {
    throw new Error(
      "Missing 1claw credentials — set ONECLAW_API_KEY or (ONECLAW_AGENT_ID + ONECLAW_AGENT_API_KEY)",
    );
  }

  return createClient({ baseUrl: BASE_URL, token });
}

/**
 * Fetch a single secret from the vault by path.
 * Returns the plaintext value, or null if the secret is not found / not accessible.
 *
 * @example
 *   const pqSeed = await fetchVaultSecret("private-keys/post-quantum-seed");
 */
export async function fetchVaultSecret(path: string): Promise<string | null> {
  const vaultId = normalize(process.env.ONECLAW_VAULT_ID);
  if (!vaultId) return null;

  try {
    const client = await agentClient();
    const { data } = await client.secrets.get(vaultId, path, {
      reason: "agent-transaction-signing",
    });
    if (!data) return null;
    return typeof data.value === "string" ? data.value.trim() : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[vault] Failed to fetch secret at "${path}":`, msg);
    return null;
  }
}

/**
 * Fetch AGENT_PRIVATE_KEY and POST_QUANTUM_SEED in parallel.
 * Falls back to plain env vars if vault is not configured or fetch fails.
 */
export async function resolveSigningKeys(): Promise<{
  agentPrivateKey: string | null;
  postQuantumSeed: string | null;
  source: "env" | "vault" | "none";
}> {
  // 1. Try plain env vars first (fastest — no network round-trip)
  const envKey = (process.env.AGENT_PRIVATE_KEY || "").trim();
  const envSeed = (process.env.POST_QUANTUM_SEED || "").trim();
  if (envKey && envSeed) {
    return { agentPrivateKey: envKey, postQuantumSeed: envSeed, source: "env" };
  }

  // 2. Fetch missing values from 1claw vault
  const vaultId = normalize(process.env.ONECLAW_VAULT_ID);
  if (!vaultId) {
    return { agentPrivateKey: envKey || null, postQuantumSeed: envSeed || null, source: "none" };
  }

  const [vaultKey, vaultSeed] = await Promise.all([
    !envKey ? fetchVaultSecret("private-keys/agent") : Promise.resolve(envKey),
    !envSeed ? fetchVaultSecret("private-keys/post-quantum-seed") : Promise.resolve(envSeed),
  ]);

  const finalKey = vaultKey || envKey || null;
  const finalSeed = vaultSeed || envSeed || null;

  return {
    agentPrivateKey: finalKey,
    postQuantumSeed: finalSeed,
    source: finalKey && finalSeed ? "vault" : "none",
  };
}
