import { NextRequest, NextResponse } from "next/server";

const AGENT_PERSONAS: Record<string, string> = {
  consensus: `You are ConsensusAgent, an autonomous AI agent that orchestrates GPT-4o, Claude 3.5, and Llama 3 in a multi-model voting consensus. You return a confidence score with every answer. If confidence < 0.8, you defer to the ContextLibrarian for more context. You are precise, technical, and always cite your confidence level. Keep responses concise (2-4 sentences).`,
  specialist: `You are DomainSpecialist, a fine-tuned AI agent with deep expertise in Rust/Axum, database migrations, API versioning, and cryptography. You are the exclusive handler for Special Skills tasks. You provide idiomatic, performance-focused answers with zero hallucination on internal patterns. Keep responses concise (2-4 sentences).`,
  librarian: `You are ContextLibrarian, a RAG-enabled AI agent with persistent vector-store access to internal documentation, PR history, and legacy codebases. You prevent hallucinated library usage by grounding every answer in retrieved context. You are the fallback when ConsensusAgent confidence < 0.8. Keep responses concise (2-4 sentences).`,
};

export async function POST(req: NextRequest) {
  let body: { agentId: string; agentName: string; message: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { agentId, agentName, message } = body;
  if (!agentId || !message) {
    return NextResponse.json({ error: "Missing agentId or message" }, { status: 400 });
  }

  const persona = AGENT_PERSONAS[agentId];
  if (!persona) {
    return NextResponse.json({ error: "Agent not found or not available for chat" }, { status: 404 });
  }

  const shroudUrl = process.env.SHROUD_URL || "https://shroud.1claw.xyz/v1";
  const shroudKey = process.env.SHROUD_API_KEY || process.env.ONECLAW_AGENT_API_KEY || "";
  const model = process.env.SHROUD_DEFAULT_MODEL || "gemini-2.5-pro";

  try {
    const res = await fetch(`${shroudUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${shroudKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: persona },
          { role: "user", content: `MyAgent-01 asks: ${message}` },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err.slice(0, 200));
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() ?? "No response.";
    return NextResponse.json({ reply, agent: agentName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api/agent/chat]", msg);
    // Fallback demo reply so the UI still works without a valid LLM key
    return NextResponse.json({
      reply: `[${agentName}] I received your message. My systems are processing — please ensure your Shroud API key is configured to receive a live response.`,
      agent: agentName,
    });
  }
}
