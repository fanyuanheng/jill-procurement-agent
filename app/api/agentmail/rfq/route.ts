import { NextResponse } from "next/server";
import { agentMailService } from "../../../../lib/services/agentmail";
import type { AgentMailService } from "../../../../lib/services/agentmail";
import { getDemoMode } from "../../../../lib/env";
import { store } from "../../../../lib/store";

export async function POST(request: Request) {
  return sendRfqHandler(request, agentMailService);
}

export async function sendRfqHandler(request: Request, service: AgentMailService) {
  let body: { rfqId?: string; vendorIds?: string[] } = {};
  try {
    body = (await request.json()) as { rfqId?: string; vendorIds?: string[] };
    if (!body.rfqId) return NextResponse.json({ error: "rfqId is required" }, { status: 400 });

    const rfq = store.getRfq(body.rfqId);
    if (!rfq) return NextResponse.json({ error: `RFQ not found: ${body.rfqId}` }, { status: 404 });

    const vendors = store.listVendors().filter((vendor) => (body.vendorIds ?? rfq.selectedVendorIds).includes(vendor.id));
    if (vendors.length === 0) return NextResponse.json({ error: "At least one vendor is required" }, { status: 400 });

    const sent = await service.sendRfq(rfq, vendors);
    await service.flushSimulation();
    const quotes = await service.getQuotes(rfq.id);
    store.updateRfq(rfq.id, {
      stage: quotes.length > 0 ? "Quote Comparison" : "Send",
      status: quotes.length > 0 ? "Quotes In" : "Sent",
      selectedVendorIds: vendors.map((vendor) => vendor.id)
    });

    return NextResponse.json({ mode: sent[0]?.mode ?? "simulation", sent, quotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Jill could not send the RFQ email.";
    const mode = await resolveServiceMode(service);
    const status = mode === "live" ? 502 : 500;
    return NextResponse.json({ error: message, mode }, { status });
  }
}

async function resolveServiceMode(service: AgentMailService) {
  try {
    return (await service.provisionJillInbox()).mode;
  } catch {
    return getDemoMode();
  }
}
