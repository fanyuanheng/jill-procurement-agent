import { describe, expect, it, vi } from "vitest";
import { POST as agentmailWebhook } from "../../app/api/agentmail/webhook/route";
import { createAgentMailService, type AgentMailSdkLike } from "../../lib/services/agentmail";
import { createInMemoryStore } from "../../lib/store";
import type { PurchaseOrder, Rfq, Vendor } from "../../lib/types";

const jillInbox = "bsl-procurement@agentmail.to";

const rfq: Rfq = {
  id: "rfq-test",
  title: "API 610 pump package replacement",
  requester: "Jamie Buyer",
  department: "Operations",
  stage: "Supplier Selection",
  status: "Drafting",
  category: "Industrial Equipment",
  budget: 185000,
  currency: "USD",
  neededBy: "2026-07-15",
  shipTo: "Basin Field Station 4",
  selectedVendorIds: ["vendor-northstar"],
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z",
  lineItems: []
};
const vendors: Vendor[] = [
  {
    id: "vendor-northstar",
    name: "Northstar Industrial Supply",
    source: "Vendor Master",
    reliabilityPercent: 96,
    rating: 4.8,
    complianceStatus: "Compliant",
    pastSpend: 0,
    emailAddress: "quotes@northstar.example"
  }
];

describe("AgentMail service", () => {
  it("uses simulation mode to provision Jill's inbox and record outbound RFQs without auto-injecting quotes", async () => {
    const store = createInMemoryStore();
    const service = createAgentMailService({ mode: "simulation", store, simulationDelayMs: 0 });

    const inbox = await service.provisionJillInbox();
    const sent = await service.sendRfq(rfq, vendors);
    await service.flushSimulation();
    const emptyQuotes = await service.getQuotes(rfq.id);
    const stateBeforeReply = store.getState();

    expect(stateBeforeReply.emailMessages.filter((email) => email.direction === "Inbound" && email.rfqId === rfq.id)).toHaveLength(0);
    expect(emptyQuotes).toEqual([]);

    store.addEmailMessage({
      rfqId: rfq.id,
      vendorId: vendors[0].id,
      direction: "Inbound",
      from: vendors[0].emailAddress,
      to: jillInbox,
      subject: `Re: RFQ ${rfq.id}`,
      body: "Price: USD 164,200 total for qty 2 packages. Lead: 28 calendar days.",
      provider: "simulation",
      status: "received"
    });
    const quotes = await service.getQuotes(rfq.id);
    const state = store.getState();

    expect(inbox).toEqual({ inboxId: jillInbox, emailAddress: jillInbox, mode: "simulation" });
    expect(sent).toHaveLength(1);
    expect(state.emailMessages.filter((email) => email.direction === "Outbound" && email.rfqId === rfq.id)).toHaveLength(1);
    expect(state.emailMessages.filter((email) => email.direction === "Inbound" && email.rfqId === rfq.id).length).toBe(1);
    expect(quotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          vendor: "quotes@northstar.example",
          rawEmailBody: expect.stringContaining("Price: USD 164,200")
        })
      ])
    );
    expect(state.activityFeed.map((event) => event.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("Inbound email recorded")])
    );
  });

  it("polls AgentMail for real inbound replies without treating Jill's sent RFQ as a quote", async () => {
    const store = createInMemoryStore();
    const sdk = createMockSdk({
      listResponses: [
        {
          messages: [
            {
              inboxId: jillInbox,
              messageId: "msg-outbound-rfq",
              from: jillInbox,
              subject: `RFQ ${rfq.id}: ${rfq.title}`,
              labels: [`rfq:${rfq.id}`, "sent", "rfq-outbound"]
            }
          ]
        },
        {
          messages: [
            {
              inboxId: jillInbox,
              messageId: "msg-inbound-quote",
              from: vendors[0].emailAddress,
              subject: `Re: RFQ ${rfq.id}: ${rfq.title}`,
              labels: ["received"]
            }
          ]
        }
      ],
      getMessage: {
        inboxId: jillInbox,
        messageId: "msg-inbound-quote",
        from: vendors[0].emailAddress,
        to: [jillInbox],
        subject: `Re: RFQ ${rfq.id}: ${rfq.title}`,
        extractedText: "Prepared quote: USD 164,200 total. Lead time 4 weeks.",
        text: ""
      }
    });
    const service = createAgentMailService({ mode: "live", store, client: sdk, inboxId: jillInbox });

    const quotes = await service.getQuotes(rfq.id);
    const state = store.getState();

    expect(sdk.inboxes.messages.list).toHaveBeenNthCalledWith(1, jillInbox, {
      limit: 50,
      labels: [`rfq:${rfq.id}`]
    });
    expect(sdk.inboxes.messages.list).toHaveBeenNthCalledWith(2, jillInbox, {
      limit: 50,
      subject: [rfq.id]
    });
    expect(quotes).toEqual([
      {
        vendor: vendors[0].emailAddress,
        rawEmailBody: "Prepared quote: USD 164,200 total. Lead time 4 weeks.",
        messageId: "msg-inbound-quote"
      }
    ]);
    expect(state.emailMessages.filter((email) => email.direction === "Inbound" && email.rfqId === rfq.id)).toHaveLength(1);
  });

  it("uses the AgentMail SDK in live mode for inbox creation, RFQ sends, message reads, and purchase orders", async () => {
    const store = createInMemoryStore();
    const sdk = createMockSdk();
    const service = createAgentMailService({ mode: "live", store, client: sdk, inboxId: jillInbox });
    const po: PurchaseOrder = {
      id: "PO-1001",
      rfqId: rfq.id,
      vendorId: vendors[0].id,
      amount: 164200,
      currency: "USD",
      status: "Issued",
      issuedAt: "2026-06-17T00:00:00.000Z"
    };

    await service.provisionJillInbox();
    await service.sendRfq(rfq, vendors.slice(0, 1));
    const quotes = await service.getQuotes(rfq.id);
    await service.sendPurchaseOrder(po, vendors[0]);

    expect(sdk.inboxes.create).not.toHaveBeenCalled();
    expect(sdk.inboxes.messages.send).toHaveBeenCalledWith(
      jillInbox,
      expect.objectContaining({
        to: vendors[0].emailAddress,
        subject: expect.stringContaining(rfq.id),
        text: expect.stringContaining(rfq.title),
        html: expect.stringContaining(rfq.title),
        labels: expect.arrayContaining([`rfq:${rfq.id}`])
      })
    );
    expect(sdk.inboxes.messages.list).toHaveBeenCalledWith(jillInbox, {
      limit: 50,
      labels: [`rfq:${rfq.id}`]
    });
    expect(sdk.inboxes.messages.get).toHaveBeenCalledWith(jillInbox, "msg-inbound-1");
    expect(quotes).toEqual([{ vendor: "vendor@example.com", rawEmailBody: "Unit price 12, total 24", messageId: "msg-inbound-1" }]);
    expect(sdk.inboxes.messages.send).toHaveBeenLastCalledWith(
      jillInbox,
      expect.objectContaining({
        to: vendors[0].emailAddress,
        subject: expect.stringContaining("PO-1001"),
        text: expect.stringContaining("164200")
      })
    );
  });

  it("appends inbound webhook messages to the singleton store in live mode", async () => {
    const response = await agentmailWebhook(
      new Request("http://localhost/api/agentmail/webhook", {
        method: "POST",
        body: JSON.stringify({
          event_type: "message.received",
          message: {
            inbox_id: jillInbox,
            message_id: "msg-webhook-1",
            thread_id: "thread-rfq-pump",
            from: "supplier@example.com",
            to: [jillInbox],
            subject: `Re: RFQ ${rfq.id}`,
            extracted_text: "Webhook quote body",
            text: "Fallback body",
            timestamp: "2026-06-17T05:00:00.000Z",
            labels: [`rfq:${rfq.id}`]
          }
        })
      })
    );

    const body = await response.json();

    expect(body).toEqual({ ok: true, stored: true });
  });
});

function createMockSdk({
  listResponses,
  getMessage
}: {
  listResponses?: Array<{ messages: Array<{ messageId: string; from?: string; subject?: string; labels?: string[]; inboxId?: string }> }>;
  getMessage?: {
    inboxId?: string;
    messageId: string;
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
    extractedText?: string;
    extractedHtml?: string;
  };
} = {}): AgentMailSdkLike {
  const responses = listResponses
    ? [...listResponses]
    : [
        {
          messages: [
            {
              inboxId: "jill@agentmail.to",
              messageId: "msg-inbound-1",
              from: "vendor@example.com",
              subject: `Re: RFQ ${rfq.id}`,
              labels: [`rfq:${rfq.id}`]
            }
          ]
        }
      ];
  return {
    inboxes: {
      create: vi.fn(async () => ({
        inboxId: "jill@agentmail.to",
        email: "jill@agentmail.to"
      })),
      messages: {
        send: vi.fn(async () => ({ messageId: "msg-sent", threadId: "thread-1" })),
        list: vi.fn(async () => responses.shift() ?? { messages: [] }),
        get: vi.fn(async () => getMessage ?? ({
          inboxId: "jill@agentmail.to",
          messageId: "msg-inbound-1",
          from: "vendor@example.com",
          to: ["jill@agentmail.to"],
          subject: `Re: RFQ ${rfq.id}`,
          extractedText: "Unit price 12, total 24",
          text: "quoted history"
        }))
      }
    }
  };
}
