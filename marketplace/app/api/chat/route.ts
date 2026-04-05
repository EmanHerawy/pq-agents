import { createGoogleGenerativeAI } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  zodSchema,
  type ModelMessage,
  type UIMessage,
  type ToolSet,
} from "ai";
import { tool } from "@ai-sdk/provider-utils";
import { z } from "zod";
import { resolveSigningKeys } from "@/lib/oneclaw-vault";

const shroudBaseURL =
  process.env.SHROUD_BASE_URL || "https://shroud.1claw.xyz/v1";

const shroudProvider =
  process.env.SHROUD_LLM_PROVIDER || "openrouter";

const shroudModelFallback = "openai/gpt-4o";
/** Body + X-Shroud-Model; Stripe AI Gateway often 404s on gemini-2.5-flash — remap for Shroud only. */
const defaultModel = (() => {
  const raw =
    (process.env.SHROUD_DEFAULT_MODEL || "").trim() || shroudModelFallback;
  const p = shroudProvider.toLowerCase();
  if (
    (p === "google" || p === "gemini") &&
    raw === "gemini-2.5-flash"
  ) {
    return "gemini-2.0-flash";
  }
  return raw;
})();

/** Model ID passed to @ai-sdk/google when calling Gemini directly (overrides SHROUD_DEFAULT_MODEL for that path only). */
const geminiDirectModel =
  (process.env.GOOGLE_GENERATIVE_AI_MODEL || "").trim() || defaultModel;

const billingMode =
  (process.env.SHROUD_BILLING_MODE as "token_billing" | "provider_api_key") ||
  "token_billing";

const agentAddress = process.env.AGENT_ADDRESS || "unknown";
const agentName = process.env.AGENT_NAME || "Agent";
const agentPersona = process.env.AGENT_PERSONA || "You are an autonomous onchain AI agent.";
const agentSkills = process.env.AGENT_SKILLS ? "\nYour skills: " + process.env.AGENT_SKILLS + "." : "";

const CHAT_SYSTEM = `${agentPersona}${agentSkills}

Your on-chain identity:
- Agent address (ECDSA wallet): ${agentAddress}
- Smart account: post-quantum ERC-4337 (ML-DSA-44 + ECDSA hybrid, ZKNOX)
- Name: ${agentName}

You have the following tools available:
- send_transaction: Send USDC to another agent or address using your PQ smart account. Keys are fetched securely from the 1claw vault — you never see the raw private key.
- check_vault: Verify that your vault credentials are working and signing keys are accessible.

When a user asks you to pay, buy, send, or transfer, use send_transaction. Always confirm the recipient and amount before sending. After sending, show the transaction hash.`;

/** Tools the agent can call autonomously */
const agentTools: ToolSet = {
  send_transaction: tool({
    description:
      "Send USDC to a recipient using the agent's post-quantum ERC-4337 smart account. Keys are loaded from the 1claw vault — the agent never sees the raw private key.",
    inputSchema: zodSchema(
      z.object({
        to: z.string().describe("Recipient Ethereum address (0x...)"),
        amount: z.number().positive().describe("Amount in USDC (e.g. 10 for 10 USDC)"),
        reason: z.string().optional().describe("Human-readable reason for this payment"),
      }),
    ),
    execute: async ({ to, amount, reason }: { to: string; amount: number; reason?: string }) => {
      try {
        const res = await fetch(
          (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000") + "/api/agent/buy",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to, amount, agentId: "self", service: reason || "agent payment" }),
          },
        );
        const data = (await res.json()) as { txHash?: string; simulated?: boolean; error?: string };
        if (!res.ok || data.error) return { success: false, error: data.error || "Transaction failed" };
        return {
          success: true,
          txHash: data.txHash,
          simulated: data.simulated ?? false,
          message: data.simulated ? "Simulated (no vault keys configured)" : `Sent! tx: ${data.txHash}`,
        };
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  }),

  check_vault: tool({
    description: "Check whether the 1claw vault is reachable and signing keys are accessible.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      const { source, agentPrivateKey, postQuantumSeed } = await resolveSigningKeys();
      return {
        source,
        hasEcdsaKey: !!agentPrivateKey,
        hasPqSeed: !!postQuantumSeed,
        vaultId: (process.env.ONECLAW_VAULT_ID || "").trim() || "not configured",
        status: source === "none" ? "keys not found — check ONECLAW_VAULT_ID + credentials" : "ok",
      };
    },
  }),
};

const STREAM_CHUNK =
  Math.max(8, Number(process.env.SHROUD_STREAM_CHUNK_CHARS || "40") || 40);

/** Canonical 8-4-4-4-12 hex (any version/variant 1Claw may return). */
const ONECLAW_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeOneclawEnvValue(v: string | undefined) {
  let s = (v || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (s === "undefined" || s === "null") return "";
  return s;
}

function looksLikeEthereumAddress(s: string) {
  if (!s.startsWith("0x") && !s.startsWith("0X")) return false;
  const hex = s.slice(2);
  return (
    /^[0-9a-fA-F]+$/.test(hex) && (hex.length === 40 || hex.length === 64)
  );
}

function shroudConfigError(message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * If ONECLAW_AGENT_ID is empty but ONECLAW_API_KEY is present, fetch the first
 * agent UUID from the 1claw API and cache it in process.env for subsequent requests.
 */
async function resolveAgentId(): Promise<string> {
  const explicit = normalizeOneclawEnvValue(process.env.ONECLAW_AGENT_ID);
  if (explicit) return explicit;

  const masterKey = normalizeOneclawEnvValue(process.env.ONECLAW_API_KEY);
  if (!masterKey) return "";

  try {
    const base = (process.env.ONECLAW_API_BASE_URL || "https://api.1claw.xyz").replace(/\/$/, "");
    // Get a short-lived token from the master API key
    const tokenRes = await fetch(base + "/v1/auth/api-key-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: masterKey }),
    });
    if (!tokenRes.ok) return "";
    const { access_token: token } = await tokenRes.json() as { access_token: string };

    // List agents and take the first UUID
    const agentsRes = await fetch(base + "/v1/agents", {
      headers: { Authorization: "Bearer " + token },
    });
    if (!agentsRes.ok) return "";
    const data = await agentsRes.json() as { agents?: Array<{ id: string }> } | Array<{ id: string }>;
    const list = Array.isArray(data) ? data : (data.agents ?? []);
    const id = list[0]?.id ?? "";
    if (id && ONECLAW_UUID_RE.test(id)) {
      // Cache so the next request doesn't re-fetch
      process.env.ONECLAW_AGENT_ID = id;
      console.log("[api/chat] resolved ONECLAW_AGENT_ID from master key:", id);
    }
    return id;
  } catch (e) {
    console.error("[api/chat] failed to auto-resolve ONECLAW_AGENT_ID:", e);
    return "";
  }
}

async function validateShroudEnv(): Promise<
  | { ok: true; agentId: string; agentKey: string }
  | { ok: false; response: Response }
> {
  const agentId = await resolveAgentId();
  const agentKey = normalizeOneclawEnvValue(process.env.ONECLAW_AGENT_API_KEY);

  if (!agentId || !agentKey) {
    return {
      ok: false,
      response: shroudConfigError(
        "Missing ONECLAW_AGENT_ID or ONECLAW_AGENT_API_KEY. Create an agent in 1claw.xyz and copy its UUID (not a wallet address) + API key into .env / .env.secrets.encrypted, then restart next dev. If you see ONECLAW_AGENT_ID=undefined in .env, remove it — that is invalid; use just list-1claw or the dashboard for the real UUID.",
      ),
    };
  }

  if (!ONECLAW_UUID_RE.test(agentId)) {
    const hint = looksLikeEthereumAddress(agentId)
      ? " You pasted an Ethereum address — that belongs in AGENT_ADDRESS (on-chain wallet), not here. Use the agent UUID from 1claw.xyz (or run just list-1claw with ONECLAW_API_KEY)."
      : agentId.includes("0x") || agentId.includes("0X")
        ? " This value looks like a hex address. Shroud needs the 1Claw agent UUID from the dashboard (just list-1claw), not an Ethereum address."
        : "";
    return {
      ok: false,
      response: shroudConfigError(
        "ONECLAW_AGENT_ID must be a UUID from the 1Claw dashboard (e.g. 550e8400-e29b-41d4-a716-446655440000). Ethereum addresses are rejected with \"Invalid agent_id format\"." +
          hint,
      ),
    };
  }

  if (billingMode === "provider_api_key") {
    const vaultId = (process.env.ONECLAW_VAULT_ID || "").trim();
    const vaultPath = (process.env.SHROUD_PROVIDER_VAULT_PATH || "").trim();
    const inlineKey = (process.env.SHROUD_PROVIDER_API_KEY || "").trim();
    if (vaultPath && !inlineKey && !vaultId) {
      return {
        ok: false,
        response: shroudConfigError(
          "ONECLAW_VAULT_ID is empty but SHROUD_PROVIDER_VAULT_PATH is set. Copy your vault ID from 1claw.xyz into ONECLAW_VAULT_ID (needed for vault://… Shroud headers).",
        ),
      };
    }
  }

  return { ok: true, agentId, agentKey };
}

function coreContentToText(content: ModelMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("");
}

function buildShroudOpenAIMessages(core: ModelMessage[]): Array<{
  role: "system" | "user" | "assistant";
  content: string;
}> {
  const out: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [{ role: "system", content: CHAT_SYSTEM }];
  for (const m of core) {
    if (m.role === "system") continue;
    if (m.role === "user" || m.role === "assistant") {
      out.push({ role: m.role, content: coreContentToText(m.content) });
    }
  }
  return out;
}

async function readVaultSecretPlaintext(vaultId: string, secretPath: string, agentId: string, agentApiKey: string) {
  const base = (process.env.ONECLAW_API_BASE_URL || "https://api.1claw.xyz").replace(
    /\/$/,
    "",
  );
  const userApiKey = normalizeOneclawEnvValue(process.env.ONECLAW_API_KEY);
  let token;
  if (userApiKey) {
    const tr = await fetch(base + "/v1/auth/api-key-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: userApiKey }),
    });
    if (!tr.ok) return null;
    token = (await tr.json()).access_token;
  } else {
    const tr = await fetch(base + "/v1/auth/agent-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, api_key: agentApiKey }),
    });
    if (!tr.ok) return null;
    token = (await tr.json()).access_token;
  }
  const encPath = encodeURIComponent(secretPath);
  const res = await fetch(
    base + "/v1/vaults/" + vaultId + "/secrets/" + encPath,
    { headers: { Authorization: "Bearer " + token } },
  );
  if (!res.ok) return null;
  const j = await res.json();
  return typeof j.value === "string" ? j.value.trim() : null;
}

async function resolveGoogleGeminiApiKey(agentId: string, agentKey: string) {
  const inline =
    (process.env.SHROUD_PROVIDER_API_KEY || "").trim() ||
    (process.env.GOOGLE_GENERATIVE_AI_API_KEY || "").trim();
  if (inline) return inline;
  const vaultId = (process.env.ONECLAW_VAULT_ID || "").trim();
  const vaultPath =
    (process.env.SHROUD_PROVIDER_VAULT_PATH || "").trim() || "api-keys/google";
  if (!vaultId) return null;
  return readVaultSecretPlaintext(vaultId, vaultPath, agentId, agentKey);
}

function gemini503() {
  return new Response(
    JSON.stringify({
      error:
        "SHROUD_BILLING_MODE=provider_api_key needs a Google API key for the optional direct Gemini API path. Set SHROUD_PROVIDER_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY, or store the key in the vault (e.g. api-keys/google) with ONECLAW_VAULT_ID. If you use 1Claw token billing only, set SHROUD_BILLING_MODE=token_billing — chat will call Shroud without a Google key in this app.",
    }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}

async function shroudChatCompletionNonStream(
  openaiMessages: Array<{ role: string; content: string }>,
  shroudHeaders: Record<string, string>,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const base = shroudBaseURL.replace(/\/$/, "");
  const url = base + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...shroudHeaders,
    },
    body: JSON.stringify({
      model: defaultModel,
      messages: openaiMessages,
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, body: raw };
  }
  try {
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const c = data.choices?.[0]?.message?.content;
    const text = typeof c === "string" ? c : c == null ? "" : String(c);
    return { ok: true, text };
  } catch {
    return { ok: false, status: 502, body: "Invalid JSON from Shroud" };
  }
}

export async function POST(req: Request) {
  let uiMessages: Omit<UIMessage, "id">[];
  try {
    const body = await req.json();
    const raw = body.messages;
    if (!Array.isArray(raw) || raw.length === 0) {
      return new Response(JSON.stringify({ error: "Missing messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    uiMessages = raw as Omit<UIMessage, "id">[];
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const creds = await validateShroudEnv();
  if (!creds.ok) return creds.response;
  const { agentId, agentKey } = creds;

  const providerLC = shroudProvider.toLowerCase();
  if (
    (providerLC === "google" || providerLC === "gemini") &&
    process.env.SHROUD_DISABLE_GEMINI_DIRECT !== "1"
  ) {
    const geminiKey = await resolveGoogleGeminiApiKey(agentId, agentKey);
    if (geminiKey) {
      const google = createGoogleGenerativeAI({ apiKey: geminiKey });
      const result = streamText({
        model: google(geminiDirectModel),
        system: CHAT_SYSTEM,
        tools: agentTools,
        messages: await convertToModelMessages(uiMessages),
        onError({ error }) {
          const msg = error instanceof Error ? error.message : String(error);
          if (
            /quota|429|RESOURCE_EXHAUSTED|exceeded your current quota/i.test(msg)
          ) {
            console.error(
              "[api/chat] Gemini quota/rate limit — set GOOGLE_GENERATIVE_AI_MODEL (e.g. gemini-2.5-flash) or SHROUD_DEFAULT_MODEL, enable billing: https://ai.google.dev/gemini-api/docs/rate-limits",
            );
          }
          console.error("[api/chat] Gemini (direct) error:", error);
        },
      });
      return result.toUIMessageStreamResponse();
    }
    if (billingMode === "provider_api_key") {
      return gemini503();
    }
    // token_billing: no BYOK Google key — use Shroud (1Claw-billed) for Gemini
  }

  const shroudHeaders: Record<string, string> = {
    "X-Shroud-Agent-Key": agentId + ":" + agentKey,
    "X-Shroud-Provider": shroudProvider,
    "X-Shroud-Model": defaultModel,
  };

  if (billingMode === "provider_api_key") {
    const vaultId = (process.env.ONECLAW_VAULT_ID || "").trim();
    const vaultPath = (process.env.SHROUD_PROVIDER_VAULT_PATH || "").trim();
    const inlineKey = (process.env.SHROUD_PROVIDER_API_KEY || "").trim();
    if (vaultId && vaultPath) {
      shroudHeaders["X-Shroud-Api-Key"] = "vault://" + vaultId + "/" + vaultPath;
    } else if (inlineKey) {
      shroudHeaders["X-Shroud-Api-Key"] = inlineKey;
    }
  }

  const openaiMessages = buildShroudOpenAIMessages(
    await convertToModelMessages(uiMessages),
  );

  const stream = createUIMessageStream({
    async execute({ writer }) {
      const r = await shroudChatCompletionNonStream(openaiMessages, shroudHeaders);
      if (!r.ok) {
        let msg = r.body;
        try {
          const j = JSON.parse(r.body) as { error?: { message?: string } };
          if (j?.error?.message) msg = j.error.message;
        } catch { /* keep raw */ }
        throw new Error("Shroud " + r.status + ": " + msg.slice(0, 2000) + (r.body.length > 2000 ? "…" : ""));
      }
      const text = r.text;
      const textId = "t0";
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: textId });
      for (let i = 0; i < text.length; i += STREAM_CHUNK) {
        writer.write({ type: "text-delta", id: textId, delta: text.slice(i, i + STREAM_CHUNK) });
      }
      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish" });
    },
    onError(error: unknown) {
      console.error("[api/chat] Shroud stream error:", error);
      return error instanceof Error ? error.message : String(error);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
