import { NextResponse } from "next/server";
import { parseAgentMailWebhook, verifyAgentMailWebhook } from "@/lib/email/agentmailProvider";
import { store } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = verifyAgentMailWebhook(rawBody, request.headers);
    const parsed = parseAgentMailWebhook(payload);
    if (parsed.ignored) {
      return NextResponse.json({ ok: true, ignored: parsed.ignored });
    }

    const state = await store.getState();
    const rfqId = parsed.rfqId ?? state.rfqs[0]?.id;
    if (!rfqId) throw new Error("No RFQ available for inbound quote");
    if (!parsed.quote) throw new Error("No quote payload parsed from AgentMail webhook");
    return NextResponse.json(await store.addQuotes(rfqId, [parsed.quote]));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
}
