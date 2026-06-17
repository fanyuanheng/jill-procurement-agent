import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { ingestInboundAgentMailEvent } from "../../../../lib/services/agentmail";

export async function POST(request: Request) {
  const rawBody = await request.text();
  let payload: unknown;

  try {
    payload = verifyWebhookIfConfigured(rawBody, request.headers);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid webhook signature" }, { status: 400 });
  }

  const result = await ingestInboundAgentMailEvent(payload);
  return NextResponse.json({ ok: true, stored: result.stored });
}

function verifyWebhookIfConfigured(rawBody: string, headers: Headers) {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return JSON.parse(rawBody);

  const webhook = new Webhook(secret);
  return webhook.verify(rawBody, {
    "svix-id": headers.get("svix-id") ?? "",
    "svix-timestamp": headers.get("svix-timestamp") ?? "",
    "svix-signature": headers.get("svix-signature") ?? ""
  });
}
