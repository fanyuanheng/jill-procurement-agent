import { NextResponse } from "next/server";
import { agentMailService, createAgentMailService } from "../../../../lib/services/agentmail";
import { store } from "../../../../lib/store";
import type { CurrencyCode, PurchaseOrder } from "../../../../lib/types";

export async function POST(request: Request) {
  let body: { rfqId?: string; vendorId?: string; vendorName?: string; amount?: number } = {};
  try {
    body = (await request.json()) as { rfqId?: string; vendorId?: string; vendorName?: string; amount?: number };
    if (!body.rfqId) return NextResponse.json({ error: "rfqId is required" }, { status: 400 });

    const rfq = store.getRfq(body.rfqId);
    if (!rfq) return NextResponse.json({ error: `RFQ not found: ${body.rfqId}` }, { status: 404 });

    const vendor = store.listVendors().find((candidate) => candidate.id === body.vendorId || candidate.name === body.vendorName);
    if (!vendor) return NextResponse.json({ error: "Winning vendor was not found" }, { status: 404 });

    const po: PurchaseOrder = {
      id: `PO-${Math.floor(1000 + Math.random() * 9000)}`,
      rfqId: rfq.id,
      vendorId: vendor.id,
      amount: Number(body.amount ?? rfq.budget),
      currency: rfq.currency as CurrencyCode,
      status: "Issued",
      issuedAt: new Date().toISOString()
    };

    store.savePurchaseOrder(po);
    store.updateRfq(rfq.id, { stage: "Award & PO Issuance", status: "PO Issued" });
    const sent = await agentMailService.sendPurchaseOrder(po, vendor);
    return NextResponse.json({ po, sent, message: `${po.id} issued — vendor notified by email.` });
  } catch (error) {
    const fallbackReason = error instanceof Error ? error.message : "Jill could not issue the PO.";
    try {
      if (!body.rfqId) throw new Error(fallbackReason);
      const rfq = store.getRfq(body.rfqId);
      if (!rfq) throw new Error(fallbackReason);
      const vendor = store.listVendors().find((candidate) => candidate.id === body.vendorId || candidate.name === body.vendorName) ?? store.listVendors()[0];
      const po: PurchaseOrder = {
        id: `PO-${Math.floor(1000 + Math.random() * 9000)}`,
        rfqId: rfq.id,
        vendorId: vendor.id,
        amount: Number(body.amount ?? rfq.budget),
        currency: rfq.currency as CurrencyCode,
        status: "Issued",
        issuedAt: new Date().toISOString()
      };
      store.savePurchaseOrder(po);
      store.updateRfq(rfq.id, { stage: "Award & PO Issuance", status: "PO Issued" });
      const fallbackService = createAgentMailService({ mode: "simulation", store, simulationDelayMs: 0 });
      const sent = await fallbackService.sendPurchaseOrder(po, vendor);
      return NextResponse.json({ mode: "fallback", fallbackReason, po, sent, message: `${po.id} issued — vendor notified by email.` });
    } catch {
      return NextResponse.json({ error: fallbackReason }, { status: 500 });
    }
  }
}
