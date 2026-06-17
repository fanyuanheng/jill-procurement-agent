import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJsonStore } from "@/lib/store";
import { demoRequest, mockQuoteInputs } from "@/lib/seed";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jill-store-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("Jill workflow store", () => {
  it("creates an RFQ with draft, shortlist, and audit event", async () => {
    const store = createJsonStore(join(dir, "state.json"));

    const rfq = await store.createRfq(demoRequest);
    const state = await store.getState();

    expect(rfq.status).toBe("rfq_ready");
    expect(rfq.suppliers).toHaveLength(3);
    expect(state.audit.at(-1)?.message).toContain("RFQ package generated");
  });

  it("moves an RFQ through sent, quoted, and awarded states", async () => {
    const store = createJsonStore(join(dir, "state.json"));

    const rfq = await store.createRfq(demoRequest);
    await store.recordOutreach(rfq.id);
    const quoted = await store.addQuotes(rfq.id, mockQuoteInputs);
    const awarded = await store.award(rfq.id, quoted.recommendation!.vendorId);

    expect(quoted.status).toBe("award_pending");
    expect(quoted.quotes).toHaveLength(3);
    expect(quoted.recommendation?.vendorName).toBe("Cascade MRO Partners");
    expect(awarded.status).toBe("po_issued");
    expect(awarded.po?.id).toMatch(/^PO-/);
  });

  it("tracks active RFQ, supplier directory, email ledger, and operational exceptions", async () => {
    const store = createJsonStore(join(dir, "state.json"));

    const first = await store.createRfq(demoRequest);
    const second = await store.createRfq({ ...demoRequest, title: "Emergency valve actuator" });
    await store.setActiveRfq(first.id);
    await store.updateVendorEmail("vendor-cascade", "cascade.procurement@example.com");
    await store.recordException(first.id, "Email delivery failed for supplier contact", "email");

    const state = await store.getState();

    expect(state.activeRfqId).toBe(first.id);
    expect(state.rfqs.map((rfq) => rfq.id)).toEqual([second.id, first.id]);
    expect(state.vendors.find((vendor) => vendor.id === "vendor-cascade")?.email).toBe("cascade.procurement@example.com");
    expect(state.exceptions).toHaveLength(1);
    expect(state.exceptions[0]).toMatchObject({
      rfqId: first.id,
      type: "email",
      status: "open"
    });
  });

  it("accepts a manually captured supplier quote", async () => {
    const store = createJsonStore(join(dir, "state.json"));

    const rfq = await store.createRfq(demoRequest);
    const quoted = await store.addManualQuote(rfq.id, {
      vendorId: "vendor-cascade",
      rawText: "Manual entry: total $171,400, lead time 21 days, Net 30, warranty 36 months. No exceptions."
    });

    expect(quoted.status).toBe("award_pending");
    expect(quoted.quotes).toHaveLength(1);
    expect(quoted.recommendation?.vendorName).toBe("Cascade MRO Partners");
  });
});
