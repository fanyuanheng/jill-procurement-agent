import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildRfqDraft, matchSuppliers } from "@/lib/rfq";
import { demoRequest, demoVendors } from "@/lib/seed";
import type { RfqRecord } from "@/lib/types";
import {
  agentmailProvider,
  buildAgentMailMessage,
  getAgentMailConfig,
  parseAgentMailWebhook,
  verifyAgentMailWebhook
} from "@/lib/email/agentmailProvider";

const originalEnv = process.env;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env = { ...originalEnv };
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = originalEnv;
});

describe("AgentMail production integration", () => {
  it("requires explicit credentials when AgentMail mode is enabled", () => {
    process.env.EMAIL_PROVIDER = "agentmail";

    expect(() => getAgentMailConfig()).toThrow("AGENTMAIL_API_KEY");
  });

  it("builds a production send payload with labels, headers, and safe test routing", () => {
    process.env.EMAIL_PROVIDER = "agentmail";
    process.env.AGENTMAIL_API_KEY = "key_test";
    process.env.AGENTMAIL_INBOX_ID = "jill@agentmail.to";
    process.env.AGENTMAIL_TEST_RECIPIENT = "buyer@example.com";

    const rfq = makeRfq();
    const payload = buildAgentMailMessage(rfq, rfq.suppliers[0]);

    expect(payload.to).toBe("buyer@example.com");
    expect(payload.subject).toBe("RFQ Package: Replacement high-pressure pump package");
    expect(payload.text).toContain("Technical specs:");
    expect(payload.html).toContain("<strong>Technical specs:</strong>");
    expect(payload.labels).toEqual(["jill", "rfq", rfq.id]);
    expect(payload.headers["X-Jill-RFQ-ID"]).toBe(rfq.id);
    expect(payload.headers["X-Jill-Vendor-ID"]).toBe(rfq.suppliers[0].vendor.id);
  });

  it("rejects example vendor recipients in AgentMail mode unless safe routing is configured", () => {
    process.env.EMAIL_PROVIDER = "agentmail";
    process.env.AGENTMAIL_API_KEY = "key_test";
    process.env.AGENTMAIL_INBOX_ID = "jill@agentmail.to";
    const rfq = makeRfq();
    const exampleSupplier = {
      ...rfq.suppliers[0],
      vendor: {
        ...rfq.suppliers[0].vendor,
        email: "blocked@example.test"
      }
    };

    expect(() => buildAgentMailMessage(rfq, exampleSupplier)).toThrow("AGENTMAIL_TEST_RECIPIENT");
  });

  it("requires supplier contact emails before live AgentMail sends", () => {
    process.env.EMAIL_PROVIDER = "agentmail";
    process.env.AGENTMAIL_API_KEY = "key_test";
    process.env.AGENTMAIL_INBOX_ID = "jill@agentmail.to";
    delete process.env.AGENTMAIL_TEST_RECIPIENT;

    const rfq = makeRfq();
    expect(rfq.suppliers.map((supplier) => supplier.vendor.email)).toEqual(["", "", ""]);
    expect(() => buildAgentMailMessage(rfq, rfq.suppliers[0])).toThrow("Supplier email is required");
  });

  it("sends RFQs through the documented AgentMail inbox send endpoint", async () => {
    process.env.EMAIL_PROVIDER = "agentmail";
    process.env.AGENTMAIL_API_KEY = "key_test";
    process.env.AGENTMAIL_INBOX_ID = "jill@agentmail.to";
    process.env.AGENTMAIL_TEST_RECIPIENT = "buyer@example.com";

    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message_id: "msg_123", thread_id: "thr_456" })
    } as Response);

    const sent = await agentmailProvider.sendRfq(makeRfq());

    expect(fetch).toHaveBeenCalledWith(
      "https://api.agentmail.to/v0/inboxes/jill%40agentmail.to/messages/send",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer key_test" })
      })
    );
    expect(sent[0].id).toBe("msg_123");
    expect(sent[0].providerThreadId).toBe("thr_456");
  });

  it("verifies Svix-signed AgentMail webhook payloads from the raw body", () => {
    const secret = `whsec_${Buffer.from("test-secret-test-secret-test-secret").toString("base64")}`;
    const rawBody = JSON.stringify({
      event_type: "message.received",
      message: {
        text: "$171,400 lead time 21 days Net 30 warranty 36 months",
        from: "cascade@example.com",
        headers: {
          "x-jill-rfq-id": "rfq-1",
          "x-jill-vendor-id": "vendor-cascade"
        }
      }
    });
    const webhook = new Webhook(secret);
    const msgId = "msg_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = new Headers({
      "svix-id": msgId,
      "svix-timestamp": String(timestamp),
      "svix-signature": webhook.sign(msgId, new Date(timestamp * 1000), rawBody)
    });

    expect(verifyAgentMailWebhook(rawBody, headers, secret)).toMatchObject({
      event_type: "message.received"
    });
  });

  it("parses inbound AgentMail quote context from metadata or Jill headers", () => {
    const quote = parseAgentMailWebhook({
      event_type: "message.received",
      message: {
        text: "$171,400 lead time 21 days Net 30 warranty 36 months",
        from: "cascade@example.com",
        headers: {
          "x-jill-rfq-id": "rfq-1",
          "x-jill-vendor-id": "vendor-cascade"
        }
      }
    });

    expect(quote).toEqual({
      rfqId: "rfq-1",
      quote: {
        vendorId: "vendor-cascade",
        rawText: "$171,400 lead time 21 days Net 30 warranty 36 months"
      }
    });
  });
});

function makeRfq(): RfqRecord {
  return {
    id: "rfq-1",
    createdAt: "2026-06-03T00:00:00.000Z",
    request: demoRequest,
    draft: buildRfqDraft(demoRequest),
    suppliers: matchSuppliers(demoRequest, demoVendors),
    quotes: [],
    status: "rfq_ready"
  };
}
