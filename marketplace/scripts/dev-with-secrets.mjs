#!/usr/bin/env node
/**
 * Loads ../my_agent/.env (public) and ../my_agent/.env.secrets.encrypted
 * (private, AES-256-GCM) into process.env, then spawns `next dev`.
 *
 * Usage:
 *   node scripts/dev-with-secrets.mjs
 *   SCAFFOLD_ENV_PASSWORD=yourpassword node scripts/dev-with-secrets.mjs
 */

import { createDecipheriv, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MY_AGENT_DIR = join(__dirname, "../../my_agent");
const DOTENV = join(MY_AGENT_DIR, ".env");
const ENC = join(MY_AGENT_DIR, ".env.secrets.encrypted");

// ── Parse a .env file into an object ────────────────────────────────────────
function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v && v !== "undefined" && v !== "null") out[k] = v;
  }
  return out;
}

// ── AES-256-GCM decrypt (matches scaffold's secrets-crypto.mjs) ─────────────
function decryptSecretsFile(filePath, password) {
  const SALT_LEN = 32, IV_LEN = 16, TAG_LEN = 16;
  const data = readFileSync(filePath);
  if (data.length < SALT_LEN + IV_LEN + TAG_LEN) throw new Error("Invalid secrets file");
  const salt = data.subarray(0, SALT_LEN);
  const iv = data.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = data.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const encrypted = data.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = scryptSync(password, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const json = decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
  return JSON.parse(json);
}

// ── Password prompt (reads SCAFFOLD_ENV_PASSWORD or asks interactively) ──────
function promptPassword(text) {
  return new Promise((resolve, reject) => {
    const pre = process.env.SCAFFOLD_ENV_PASSWORD;
    if (pre) { resolve(pre); return; }
    if (!process.stdin.isTTY) {
      reject(new Error("No TTY — set SCAFFOLD_ENV_PASSWORD env var"));
      return;
    }
    process.stdout.write(text);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    let buf = "";
    const onData = (ch) => {
      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(buf);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else if (ch === "\u007f" || ch === "\b") {
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  // 1. Load public .env
  const pub = loadEnvFile(DOTENV);
  let loaded = 0;
  for (const [k, v] of Object.entries(pub)) {
    process.env[k] = v;
    loaded++;
  }
  console.log(`[env] loaded ${loaded} vars from ${DOTENV}`);

  // 2. Decrypt and load secrets
  if (existsSync(ENC)) {
    try {
      const pw = await promptPassword("Secrets password (.env.secrets.encrypted): ");
      const secrets = decryptSecretsFile(ENC, pw);
      let secretCount = 0;
      for (const [k, v] of Object.entries(secrets)) {
        if (typeof v === "string" && v) {
          process.env[k] = v;
          secretCount++;
        }
      }
      console.log(`[env] decrypted ${secretCount} secrets from ${ENC}`);
    } catch (e) {
      console.error("[env] Failed to decrypt secrets:", e.message);
      console.error("      Set SCAFFOLD_ENV_PASSWORD or check your password.");
      process.exit(1);
    }
  } else {
    console.warn("[env] No .env.secrets.encrypted found at", ENC);
  }

  // 3. Spawn next dev
  const child = spawn("npx", ["next", "dev"], {
    stdio: "inherit",
    env: process.env,
    shell: false,
  });
  child.on("exit", (code, sig) => {
    process.exit(code ?? (sig ? 1 : 0));
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
