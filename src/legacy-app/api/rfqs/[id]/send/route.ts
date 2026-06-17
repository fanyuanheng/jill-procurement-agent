import { NextResponse } from "next/server";
import { getEmailProvider } from "@/lib/email/agentmailProvider";
import { store } from "@/lib/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const state = await store.getState();
    const rfq = state.rfqs.find((candidate) => candidate.id === id);
    if (!rfq) throw new Error(`RFQ not found: ${id}`);

    const sentEmails = await getEmailProvider().sendRfq(rfq);
    return NextResponse.json(await store.recordOutreach(id, sentEmails));
  } catch (error) {
    const { id } = await params;
    await store.recordException(id, error instanceof Error ? error.message : "Unexpected email delivery error", "email").catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 400 });
  }
}
