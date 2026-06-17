import { describe, expect, it } from "vitest";
import {
  buildRfqDraft,
  matchSuppliers,
  normalizeQuote,
  recommendAward
} from "@/lib/rfq";
import { demoVendors } from "@/lib/seed";
import type { ProcurementRequest, QuoteInput } from "@/lib/types";

const request: ProcurementRequest = {
  title: "Replacement high-pressure pump package",
  category: "Rotating Equipment",
  neededBy: "2026-07-15",
  budget: 185000,
  shipTo: "Basin Field Station 4",
  requirements:
    "Need API 610 compliant pump package, stainless wetted parts, VFD, commissioning support, and delivery before shutdown window."
};

describe("Jill RFQ agent logic", () => {
  it("turns a free-form procurement request into a structured RFQ draft", () => {
    const draft = buildRfqDraft(request);

    expect(draft.title).toContain("Replacement high-pressure pump package");
    expect(draft.technicalSpecs).toContain("API 610 compliant pump package");
    expect(draft.evaluationCriteria).toEqual([
      "Total landed cost",
      "Confirmed lead time",
      "Technical compliance",
      "Supplier performance",
      "Commercial exceptions"
    ]);
    expect(draft.responseDeadline).toBe("2026-06-16");
  });

  it("shortlists reliable suppliers for the requested category and flags compliance risks", () => {
    const shortlist = matchSuppliers(request, demoVendors);

    expect(shortlist).toHaveLength(3);
    expect(shortlist[0].vendor.name).toBe("Northstar Industrial Supply");
    expect(shortlist.some((item) => item.complianceFlags.includes("Single-region delivery risk"))).toBe(true);
  });

  it("normalizes messy supplier quote text into comparable fields", () => {
    const quote: QuoteInput = {
      vendorId: "vendor-northstar",
      rawText:
        "We can supply the pump package for $164,200. Lead time 28 days. Net 30. Warranty 24 months. Exception: commissioning travel billed at cost."
    };

    const normalized = normalizeQuote(quote, demoVendors);

    expect(normalized.totalPrice).toBe(164200);
    expect(normalized.leadTimeDays).toBe(28);
    expect(normalized.paymentTerms).toBe("Net 30");
    expect(normalized.warrantyMonths).toBe(24);
    expect(normalized.exceptions).toContain("commissioning travel billed at cost");
    expect(normalized.confidence).toBeGreaterThan(0.8);
  });

  it("recommends the best overall award using price, lead time, reliability, and compliance", () => {
    const quotes = [
      normalizeQuote({
        vendorId: "vendor-northstar",
        rawText: "$164,200. Lead time 28 days. Net 30. Warranty 24 months. Exception: commissioning travel billed at cost."
      }, demoVendors),
      normalizeQuote({
        vendorId: "vendor-apex",
        rawText: "$158,900. Lead time 52 days. Net 45. Warranty 18 months. No exceptions."
      }, demoVendors),
      normalizeQuote({
        vendorId: "vendor-cascade",
        rawText: "$171,400. Lead time 21 days. Net 30. Warranty 36 months. No exceptions."
      }, demoVendors)
    ];

    const recommendation = recommendAward(quotes, demoVendors);

    expect(recommendation.vendorName).toBe("Cascade MRO Partners");
    expect(recommendation.reason).toContain("recommended award because it balances delivery assurance");
  });
});
