import { NextResponse } from "next/server";
import { store } from "../../../../lib/store";
import type { CurrencyCode, NormalizedQuote, Recommendation, RfqLineItem, TechnicalSpec } from "../../../../lib/types";
import type { NormalizeQuotesResult, StructuredRfqResult } from "../../../../lib/services/jill-fallbacks";

type WorkflowRequest =
  | { action: "save-draft"; rfqId?: string; structuredRfq: StructuredRfqResult }
  | { action: "select-vendors"; rfqId: string; vendorIds: string[] }
  | { action: "send-to-approval"; rfqId: string; comparison: NormalizeQuotesResult };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as WorkflowRequest;

    if (body.action === "save-draft") {
      const structuredRfq = body.structuredRfq;
      const existing = body.rfqId ? store.getRfq(body.rfqId) : undefined;
      if (!existing) {
        const created = store.createRfq({
          title: structuredRfq.title,
          requester: "Jamie Buyer",
          department: "Operations",
          category: structuredRfq.category,
          budget: structuredRfq.budgetCeiling ?? 0,
          currency: "USD",
          neededBy: structuredRfq.requiredDeliveryDate ?? "Needs confirmation",
          shipTo: "Needs confirmation",
          lineItems: buildLineItems(structuredRfq, []),
          selectedVendorIds: [],
          stage: "Structured RFQ Draft",
          status: "Drafting"
        });
        store.recordActivity({ actor: "Jill", message: `Structured RFQ draft saved for ${created.title}.`, rfqId: created.id });
        return NextResponse.json({ rfq: created });
      }

      const updated = store.updateRfq(existing.id, {
        title: structuredRfq.title,
        category: structuredRfq.category,
        budget: structuredRfq.budgetCeiling ?? existing.budget,
        neededBy: structuredRfq.requiredDeliveryDate || existing.neededBy,
        stage: "Structured RFQ Draft",
        status: "Drafting",
        lineItems: buildLineItems(structuredRfq, existing.lineItems)
      });
      store.recordActivity({ actor: "Jill", message: `Structured RFQ draft saved for ${updated.title}.`, rfqId: existing.id });
      return NextResponse.json({ rfq: updated });
    }

    if (!body.rfqId) return NextResponse.json({ error: "rfqId is required" }, { status: 400 });

    const rfq = store.getRfq(body.rfqId);
    if (!rfq) return NextResponse.json({ error: `RFQ not found: ${body.rfqId}` }, { status: 404 });

    if (body.action === "select-vendors") {
      const vendors = body.vendorIds.filter(Boolean);
      if (vendors.length === 0) return NextResponse.json({ error: "At least one vendor is required" }, { status: 400 });
      const updated = store.updateRfq(rfq.id, {
        selectedVendorIds: vendors,
        stage: "Supplier Selection",
        status: "Drafting"
      });
      store.recordActivity({ actor: "Jill", message: `${vendors.length} vendors selected for RFQ ${rfq.id}.`, rfqId: rfq.id });
      return NextResponse.json({ rfq: updated });
    }

    if (body.action === "send-to-approval") {
      const comparison = body.comparison;
      for (const quote of comparison.quotes) {
        const vendor = store.listVendors().find((candidate) => candidate.name === quote.vendorName);
        const normalized: NormalizedQuote = {
          quoteId: `normalized-${rfq.id}-${quote.vendorName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          rfqId: rfq.id,
          vendorId: vendor?.id ?? quote.vendorName,
          vendorName: quote.vendorName,
          totalPrice: quote.totalPriceUsd ?? 0,
          currency: "USD" as CurrencyCode,
          leadTimeDays: typeof quote.leadTimeWeeks === "number" ? quote.leadTimeWeeks * 7 : 0,
          paymentTerms: quote.paymentTerms ?? "Needs confirmation",
          warranty: quote.warranty ?? "Needs confirmation",
          complianceNotes: [quote.complianceCheck, ...quote.flags].filter(Boolean),
          exceptions: quote.flags,
          confidence: 0.86
        };
        store.upsertNormalizedQuote(normalized);
      }

      const winningVendor = store.listVendors().find((candidate) => candidate.name === comparison.recommendation.vendorName);
      const recommendation: Recommendation = {
        rfqId: rfq.id,
        recommendedVendorId: winningVendor?.id ?? comparison.recommendation.vendorName,
        recommendedVendorName: comparison.recommendation.vendorName,
        rationale: comparison.recommendation.rationale,
        estimatedSavings: comparison.recommendation.savingsVsAverage,
        risks: comparison.quotes.find((quote) => quote.vendorName === comparison.recommendation.vendorName)?.flags ?? []
      };
      store.saveRecommendation(recommendation);
      const updated = store.updateRfq(rfq.id, { stage: "Award & PO Issuance", status: "Awaiting Approval" });
      store.recordActivity({ actor: "Buyer", message: `Recommendation for ${recommendation.recommendedVendorName} sent to approval.`, rfqId: rfq.id });
      return NextResponse.json({ rfq: updated, recommendation });
    }

    return NextResponse.json({ error: "Unsupported workflow action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jill could not update the RFQ workflow." }, { status: 500 });
  }
}

function buildLineItems(structuredRfq: StructuredRfqResult, existing: RfqLineItem[]): RfqLineItem[] {
  const source = existing[0];
  const technicalSpecs: TechnicalSpec[] = structuredRfq.technicalSpecs.map((spec) => ({
    name: spec.label,
    value: spec.value,
    required: true
  }));

  return [
    {
      id: source?.id ?? "line-1",
      description: structuredRfq.title,
      quantity: structuredRfq.quantity ?? source?.quantity ?? 1,
      unit: source?.unit ?? "each",
      technicalSpecs
    }
  ];
}
