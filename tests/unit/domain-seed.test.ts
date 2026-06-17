import { describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import { isSimulation } from "../../lib/env";
import { createInMemoryStore, createSqliteStore } from "../../lib/store";
import { dashboardMetrics, messyQuoteEmails, seedRfqs, seedVendors } from "../../lib/seed";
import type {
  ActivityEvent,
  EmailMessage,
  NormalizedQuote,
  PurchaseOrder,
  Quote,
  Recommendation,
  Rfq,
  RfqLineItem,
  TechnicalSpec,
  Vendor
} from "../../lib/types";

describe("root domain model and simulation seed data", () => {
  it("exports the requested domain types", () => {
    const spec: TechnicalSpec = { name: "Voltage", value: "480V", required: true };
    const line: RfqLineItem = { id: "line-1", description: "Pumps", quantity: 8, unit: "each", technicalSpecs: [spec] };
    const rfq: Rfq = {
      id: "rfq-1",
      title: "Pump package",
      requester: "Jamie Buyer",
      department: "Operations",
      stage: "Quote Comparison",
      status: "Quotes In",
      category: "Industrial Equipment",
      budget: 250000,
      currency: "USD",
      neededBy: "2026-08-01",
      shipTo: "Houston, TX",
      lineItems: [line],
      selectedVendorIds: [],
      createdAt: "2026-06-17T00:00:00.000Z",
      updatedAt: "2026-06-17T00:00:00.000Z"
    };
    const vendor: Vendor = {
      id: "vendor-1",
      name: "Acme",
      source: "Vendor Master",
      reliabilityPercent: 97,
      rating: 4.8,
      complianceStatus: "Compliant",
      pastSpend: 450000,
      emailAddress: "quotes@acme.example"
    };
    const quote: Quote = {
      id: "quote-1",
      rfqId: rfq.id,
      vendorId: vendor.id,
      emailMessageId: "email-1",
      rawBody: "total USD 100",
      receivedAt: "2026-06-17T00:00:00.000Z"
    };
    const normalized: NormalizedQuote = {
      quoteId: quote.id,
      rfqId: rfq.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      totalPrice: 100,
      currency: "USD",
      leadTimeDays: 14,
      paymentTerms: "Net 30",
      warranty: "12 months",
      complianceNotes: [],
      exceptions: [],
      confidence: 0.9
    };
    const recommendation: Recommendation = {
      rfqId: rfq.id,
      recommendedVendorId: vendor.id,
      recommendedVendorName: vendor.name,
      rationale: "Best compliant value.",
      estimatedSavings: 12000,
      risks: []
    };
    const po: PurchaseOrder = {
      id: "PO-1",
      rfqId: rfq.id,
      vendorId: vendor.id,
      amount: 100,
      currency: "USD",
      status: "Draft",
      issuedAt: "2026-06-17T00:00:00.000Z"
    };
    const event: ActivityEvent = {
      id: "event-1",
      actor: "Jill",
      message: "Created RFQ.",
      timestamp: "2026-06-17T00:00:00.000Z"
    };
    const email: EmailMessage = {
      id: "email-1",
      rfqId: rfq.id,
      direction: "Inbound",
      from: vendor.emailAddress,
      to: "jill@agentmail.to",
      subject: "Quote",
      body: quote.rawBody,
      timestamp: "2026-06-17T00:00:00.000Z",
      provider: "simulation"
    };

    expect({ rfq, vendor, quote, normalized, recommendation, po, event, email }).toBeDefined();
  });

  it("starts with a clean sheet and zeroed metrics", () => {
    expect(seedVendors).toHaveLength(0);
    expect(seedRfqs).toHaveLength(0);
    expect(dashboardMetrics).toEqual({
      annualSavings: 0,
      cycleTimeReductionPercent: 0,
      hoursRecovered: 0
    });
    expect(messyQuoteEmails).toHaveLength(0);
  });

  it("creates a server in-memory store seeded on construction with CRUD helpers", () => {
    const store = createInMemoryStore();
    const initial = store.getState();

    expect(initial.vendors).toHaveLength(0);
    expect(initial.rfqs).toHaveLength(0);
    expect(initial.emailMessages).toHaveLength(0);
    expect(initial.activityFeed).toHaveLength(0);

    const rfq = store.createRfq({
      title: "Emergency PPE replenishment",
      requester: "Jamie Buyer",
      department: "Facilities",
      category: "Safety",
      budget: 72000,
      currency: "USD",
      neededBy: "2026-07-10",
      shipTo: "Denver, CO",
      lineItems: []
    });
    const vendor = store.createVendor({
      name: "Buyer Added Supplier",
      source: "External",
      reliabilityPercent: 80,
      rating: 4,
      complianceStatus: "Review",
      pastSpend: 0,
      emailAddress: "supplier@example.com"
    });
    const email = store.addEmailMessage({
      rfqId: rfq.id,
      direction: "Outbound",
      from: "jill@agentmail.to",
      to: vendor.emailAddress,
      subject: "RFQ",
      body: "Please quote.",
      provider: "simulation"
    });
    const quote = store.addQuote({
      rfqId: rfq.id,
      vendorId: vendor.id,
      emailMessageId: email.id,
      rawBody: "USD 70,500 Net 30",
      receivedAt: email.timestamp
    });
    store.updateRfq(rfq.id, { status: "Sent", selectedVendorIds: [vendor.id] });
    const updatedVendor = store.updateVendor(vendor.id, { emailAddress: "buyer-test@example.com" });

    expect(store.getRfq(rfq.id)?.status).toBe("Sent");
    expect(updatedVendor.emailAddress).toBe("buyer-test@example.com");
    expect(vendor.id).toMatch(/^vendor-/);
    expect(store.listQuotes(rfq.id)).toEqual([quote]);
    expect(store.listActivity().at(-1)?.message).toContain("Vendor details updated");
  });

  it("defaults to simulation mode", () => {
    expect(isSimulation()).toBe(true);
  });

  it("persists RFQs, vendors, emails, quotes, recommendations, purchase orders, and activity in SQLite", () => {
    const dbPath = "data/test-persistence.sqlite";
    rmSync(dbPath, { force: true });

    const firstStore = createSqliteStore(dbPath);
    const rfq = firstStore.createRfq({
      title: "Persistent pump RFQ",
      requester: "Jamie Buyer",
      department: "Operations",
      category: "Industrial Equipment",
      budget: 185000,
      currency: "USD",
      neededBy: "2026-07-15",
      shipTo: "Basin Field Station 4",
      lineItems: []
    });
    const vendor = firstStore.createVendor({
      name: "Persistent Supplier",
      source: "External",
      reliabilityPercent: 91,
      rating: 4.4,
      complianceStatus: "Compliant",
      pastSpend: 12000,
      emailAddress: "persistent@example.com"
    });
    const email = firstStore.addEmailMessage({
      rfqId: rfq.id,
      vendorId: vendor.id,
      direction: "Inbound",
      from: vendor.emailAddress,
      to: "bsl-procurement@agentmail.to",
      subject: `Re: RFQ ${rfq.id}`,
      body: "USD 164,200 total",
      provider: "agentmail",
      status: "received"
    });
    firstStore.addQuote({
      rfqId: rfq.id,
      vendorId: vendor.id,
      emailMessageId: email.id,
      rawBody: email.body,
      receivedAt: email.timestamp
    });
    firstStore.upsertNormalizedQuote({
      quoteId: "normalized-persistent",
      rfqId: rfq.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      totalPrice: 164200,
      currency: "USD",
      leadTimeDays: 28,
      paymentTerms: "Net 30",
      warranty: "24 months",
      complianceNotes: ["Compliant"],
      exceptions: [],
      confidence: 0.92
    });
    firstStore.saveRecommendation({
      rfqId: rfq.id,
      recommendedVendorId: vendor.id,
      recommendedVendorName: vendor.name,
      rationale: "Best compliant value.",
      estimatedSavings: 0,
      risks: []
    });
    firstStore.savePurchaseOrder({
      id: "PO-PERSIST",
      rfqId: rfq.id,
      vendorId: vendor.id,
      amount: 164200,
      currency: "USD",
      status: "Issued",
      issuedAt: "2026-06-17T00:00:00.000Z"
    });

    const secondStore = createSqliteStore(dbPath);
    const state = secondStore.getState();

    expect(state.rfqs.some((candidate) => candidate.id === rfq.id)).toBe(true);
    expect(state.vendors.some((candidate) => candidate.id === vendor.id)).toBe(true);
    expect(state.emailMessages.some((candidate) => candidate.id === email.id)).toBe(true);
    expect(state.quotes.some((candidate) => candidate.rfqId === rfq.id)).toBe(true);
    expect(state.normalizedQuotes.some((candidate) => candidate.rfqId === rfq.id)).toBe(true);
    expect(state.recommendations.some((candidate) => candidate.rfqId === rfq.id)).toBe(true);
    expect(state.purchaseOrders.some((candidate) => candidate.id === "PO-PERSIST")).toBe(true);
    expect(state.activityFeed.length).toBeGreaterThan(0);
  });
});
