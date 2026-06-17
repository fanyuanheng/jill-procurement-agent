import { describe, expect, it } from "vitest";
import { GET as getState } from "../../app/api/state/route";
import { GET as getQuotes } from "../../app/api/agentmail/quotes/route";
import { POST as sendRfq } from "../../app/api/agentmail/rfq/route";
import { sendRfqHandler } from "../../app/api/agentmail/rfq/route";
import { POST as sendPurchaseOrder } from "../../app/api/agentmail/purchase-order/route";
import { DELETE as deleteRfq } from "../../app/api/rfqs/[rfqId]/route";
import { POST as updateWorkflow } from "../../app/api/rfqs/workflow/route";
import { PATCH as updateVendor } from "../../app/api/vendors/[vendorId]/route";
import { POST as createVendor } from "../../app/api/vendors/route";

describe("workflow API routes", () => {
  it("returns a clean dashboard state snapshot", async () => {
    const response = await getState();
    const body = await response.json();

    expect(body.dashboardMetrics).toEqual({
      annualSavings: 0,
      cycleTimeReductionPercent: 0,
      hoursRecovered: 0
    });
    expect(body.rfqs.length).toBeGreaterThanOrEqual(0);
    expect(body.vendors.length).toBeGreaterThanOrEqual(0);
    expect(body.emailActionsCount).toBeGreaterThanOrEqual(0);
    expect(body.llmStatus).toEqual(
      expect.objectContaining({
        provider: "local",
        model: expect.any(String),
        baseUrl: expect.stringContaining("/v1")
      })
    );
  });

  it("creates an RFQ, sends through AgentMail simulation, and reads inbound quote replies", async () => {
    const rfq = await createDraftRfq();
    const vendor = await createTestVendor("supplier-send@example.com");

    const sendResponse = await sendRfq(
      new Request("http://localhost/api/agentmail/rfq", {
        method: "POST",
        body: JSON.stringify({
          rfqId: rfq.id,
          vendorIds: [vendor.id]
        })
      })
    );
    const sendBody = await sendResponse.json();

    await import("../../app/api/agentmail/webhook/route").then(({ POST }) =>
      POST(
        new Request("http://localhost/api/agentmail/webhook", {
          method: "POST",
          body: JSON.stringify({
            event_type: "message.received",
            message: {
              from: vendor.emailAddress,
              to: ["bsl-procurement@agentmail.to"],
              subject: `Re: RFQ ${rfq.id}`,
              text: "Price: USD 164,200 total for qty 2 packages. Lead: 28 calendar days.",
              labels: [`rfq:${rfq.id}`]
            }
          })
        })
      )
    );

    const quoteResponse = await getQuotes(new Request(`http://localhost/api/agentmail/quotes?rfqId=${rfq.id}`));
    const quoteBody = await quoteResponse.json();

    expect(sendBody.mode).toBe("simulation");
    expect(sendBody.sent).toHaveLength(1);
    expect(quoteBody.quotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendor: vendor.emailAddress,
          rawEmailBody: expect.stringContaining("Price: USD 164,200")
        })
      ])
    );
  });

  it("updates vendor email details and uses them for RFQ sends", async () => {
    const rfq = await createDraftRfq();
    const vendor = await createTestVendor("supplier@example.com");

    const vendorResponse = await updateVendor(
      new Request(`http://localhost/api/vendors/${vendor.id}`, {
        method: "PATCH",
        body: JSON.stringify({ emailAddress: "real-buyer-test@northstar.example" })
      }),
      { params: Promise.resolve({ vendorId: vendor.id }) }
    );
    const vendorBody = await vendorResponse.json();

    const sendResponse = await sendRfq(
      new Request("http://localhost/api/agentmail/rfq", {
        method: "POST",
        body: JSON.stringify({
          rfqId: rfq.id,
          vendorIds: [vendor.id]
        })
      })
    );
    const sendBody = await sendResponse.json();

    expect(vendorBody.vendor.emailAddress).toBe("real-buyer-test@northstar.example");
    expect(sendBody.sent[0].to).toBe("real-buyer-test@northstar.example");
  });

  it("does not mask live AgentMail send failures with simulation fallback", async () => {
    const rfq = await createDraftRfq();
    const vendor = await createTestVendor("supplier-live-fail@example.com");
    const failingLiveService = {
      provisionJillInbox: async () => ({ inboxId: "bsl-procurement@agentmail.to", emailAddress: "bsl-procurement@agentmail.to", mode: "live" as const }),
      sendRfq: async () => {
        throw new Error("AgentMail rejected recipient");
      },
      getQuotes: async () => [],
      sendPurchaseOrder: async () => {
        throw new Error("not used");
      },
      flushSimulation: async () => undefined
    };

    const response = await sendRfqHandler(
      new Request("http://localhost/api/agentmail/rfq", {
        method: "POST",
        body: JSON.stringify({
          rfqId: rfq.id,
          vendorIds: [vendor.id]
        })
      }),
      failingLiveService
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toContain("AgentMail rejected recipient");
    expect(body.mode).toBe("live");
  });

  it("persists RFQ draft, vendor selection, and approval transitions", async () => {
    const rfq = await createDraftRfq();
    const vendor = await createTestVendor("supplier-approval@example.com");

    const selectionResponse = await updateWorkflow(
      new Request("http://localhost/api/rfqs/workflow", {
        method: "POST",
        body: JSON.stringify({
          action: "select-vendors",
          rfqId: rfq.id,
          vendorIds: [vendor.id]
        })
      })
    );
    const selectionBody = await selectionResponse.json();
    expect(selectionBody.rfq.stage).toBe("Supplier Selection");

    const approvalResponse = await updateWorkflow(
      new Request("http://localhost/api/rfqs/workflow", {
        method: "POST",
        body: JSON.stringify({
          action: "send-to-approval",
          rfqId: rfq.id,
          comparison: {
            quotes: [
              {
                vendorName: vendor.name,
                unitPriceUsd: 82100,
                quantity: 2,
                totalPriceUsd: 164200,
                leadTimeWeeks: 4,
                warranty: "18 months",
                certifications: ["API 610"],
                paymentTerms: "Net 30",
                complianceCheck: "Compliant",
                flags: []
              }
            ],
            recommendation: {
              vendorName: vendor.name,
              rationale: "Best compliant value with acceptable lead time.",
              savingsVsAverage: 12000
            }
          }
        })
      })
    );
    const approvalBody = await approvalResponse.json();
    expect(approvalBody.rfq.status).toBe("Awaiting Approval");
    expect(approvalBody.recommendation.recommendedVendorName).toBe(vendor.name);
  });

  it("deletes draft RFQs from the workspace", async () => {
    const rfq = await createDraftRfq();
    const response = await deleteRfq(new Request(`http://localhost/api/rfqs/${rfq.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ rfqId: rfq.id })
    });
    const body = await response.json();
    const stateResponse = await getState();
    const stateBody = await stateResponse.json();

    expect(response.status).toBe(200);
    expect(body.deleted.id).toBe(rfq.id);
    expect(stateBody.rfqs.some((candidate: { id: string }) => candidate.id === rfq.id)).toBe(false);
  });

  it("deletes RFQs after they leave draft status", async () => {
    const rfq = await createDraftRfq();
    const vendor = await createTestVendor("supplier-delete-guard@example.com");
    await updateWorkflow(
      new Request("http://localhost/api/rfqs/workflow", {
        method: "POST",
        body: JSON.stringify({
          action: "select-vendors",
          rfqId: rfq.id,
          vendorIds: [vendor.id]
        })
      })
    );
    await sendRfq(
      new Request("http://localhost/api/agentmail/rfq", {
        method: "POST",
        body: JSON.stringify({
          rfqId: rfq.id,
          vendorIds: [vendor.id]
        })
      })
    );

    const response = await deleteRfq(new Request(`http://localhost/api/rfqs/${rfq.id}`, { method: "DELETE" }), {
      params: Promise.resolve({ rfqId: rfq.id })
    });
    const body = await response.json();
    const stateResponse = await getState();
    const stateBody = await stateResponse.json();

    expect(response.status).toBe(200);
    expect(body.deleted.id).toBe(rfq.id);
    expect(stateBody.rfqs.some((candidate: { id: string }) => candidate.id === rfq.id)).toBe(false);
  });

  it("issues a purchase order and records vendor notification", async () => {
    const rfq = await createDraftRfq();
    const vendor = await createTestVendor("supplier-po@example.com");
    const response = await sendPurchaseOrder(
      new Request("http://localhost/api/agentmail/purchase-order", {
        method: "POST",
        body: JSON.stringify({
          rfqId: rfq.id,
          vendorId: vendor.id,
          amount: 164200
        })
      })
    );
    const body = await response.json();

    expect(body.po.id).toMatch(/^PO-/);
    expect(body.sent.subject).toContain(body.po.id);
    expect(body.message).toContain("issued");
  });
});

async function createDraftRfq() {
  const response = await updateWorkflow(
    new Request("http://localhost/api/rfqs/workflow", {
      method: "POST",
      body: JSON.stringify({
        action: "save-draft",
        structuredRfq: {
          title: "API 610 pump package replacement",
          category: "Industrial Equipment",
          quantity: 2,
          technicalSpecs: [{ label: "Standard", value: "API 610" }],
          requiredDeliveryDate: "2026-07-15",
          budgetCeiling: 185000,
          complianceNotes: ["Confirm freight"],
          fieldsNeedingBuyerConfirmation: ["Freight terms"]
        }
      })
    })
  );
  const body = await response.json();
  return body.rfq;
}

async function createTestVendor(emailAddress: string) {
  const response = await createVendor(
    new Request("http://localhost/api/vendors", {
      method: "POST",
      body: JSON.stringify({ name: `Supplier ${emailAddress}`, emailAddress })
    })
  );
  const body = await response.json();
  return body.vendor;
}
