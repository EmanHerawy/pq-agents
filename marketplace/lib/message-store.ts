/**
 * Shared in-memory message log.
 * Stored on `globalThis` so Next.js hot-reload doesn't reset it.
 * All API routes write here; the UI polls /api/agent/messages to read.
 */

export type StoredMessage = {
  id: string;
  agentId: string;
  agentName: string;
  from: "user" | "agent";
  text: string;
  ts: string;
  source: "ui" | "mcp";
};

declare global {
  // eslint-disable-next-line no-var
  var __agentMessages: StoredMessage[] | undefined;
}

function store(): StoredMessage[] {
  if (!globalThis.__agentMessages) globalThis.__agentMessages = [];
  return globalThis.__agentMessages;
}

export function addMessage(msg: Omit<StoredMessage, "id" | "ts">): StoredMessage {
  const entry: StoredMessage = {
    ...msg,
    id: Math.random().toString(36).slice(2),
    ts: new Date().toISOString(),
  };
  store().push(entry);
  // Keep last 200 messages only
  if (store().length > 200) store().splice(0, store().length - 200);
  return entry;
}

export function getMessages(agentId?: string): StoredMessage[] {
  const all = store();
  return agentId ? all.filter((m) => m.agentId === agentId) : all;
}
