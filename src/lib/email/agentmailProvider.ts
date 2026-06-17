import { Webhook } from "svix";
import { demoVendors } from "../seed";
import type { EmailRecord, QuoteInput, RfqRecord, SupplierMatch } from "../types";
import type { EmailProvider } from "./provider";

const DEFAULT_AGENTMAIL_API = "https://api.agentmail.to/v0";

export type AgentMailConfig = {
  apiBaseUrl: string;
  apiKey: string;
  inboxId: string;
  webhookSecret?: string;
  testRecipient?: string;
  allowTestVendorEmails: boolean;
};

export type AgentMailSendPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
  labels: string[];
  headers: Record<string, string>;
};

export type AgentMailEvent = {
  event_type?: string;
  type?: string;
  message?: {
    text?: string;
    extracted_text?: string;
    html?: string;
    from?: string | { email?: string; address?: string };
    subject?: string;
    headers?: Record<string, string | undefined>;
    metadata?: { vendorId?: string; rfqId?: string };
  };
  vendorId?: string;
  rfqId?: string;
};

type AgentMailSendResponse = {
  id?: string;
  message_id?: string;
  thread_id?: string;
};

export const agentmailProvider: EmailProvider = {
  async sendRfq(rfq) {
    const config = getAgentMailConfig();
    const sent: EmailRecord[] = [];

    for (const supplier of rfq.suppliers) {
      const payload = buildAgentMailMessage(rfq, supplier, config);
      const response = await fetch(`${config.apiBaseUrl}/inboxes/${encodeURIComponent(config.inboxId)}/messages/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`AgentMail send failed with ${response.status}${text ? `: ${text}` : ""}`);
      }

      const result = (await response.json().catch(() => ({}))) as AgentMailSendResponse;
      sent.push({
        id: result.message_id ?? result.id ?? `agentmail-${rfq.id}-${supplier.vendor.id}`,
        at: new Date().toISOString(),
        direction: "outbound",
        provider: "agentmail",
        providerThreadId: result.thread_id,
        vendorId: supplier.vendor.id,
        to: payload.to,
        subject: payload.subject,
        body: payload.text,
        status: "sent"
      });
    }

    return sent;
  }
};

export function getEmailProvider(): EmailProvider {
  return process.env.EMAIL_PROVIDER === "agentmail" ? agentmailProvider : mockEmailProviderShim;
}

export function getAgentMailConfig(env: NodeJS.ProcessEnv = process.env): AgentMailConfig {
  const apiKey = env.AGENTMAIL_API_KEY;
  const inboxId = env.AGENTMAIL_INBOX_ID;
  const missing = [
    ["AGENTMAIL_API_KEY", apiKey],
    ["AGENTMAIL_INBOX_ID", inboxId]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`AgentMail mode requires ${missing.join(", ")}`);
  }

  return {
    apiBaseUrl: env.AGENTMAIL_API_BASE_URL ?? DEFAULT_AGENTMAIL_API,
    apiKey: apiKey!,
    inboxId: inboxId!,
    webhookSecret: env.AGENTMAIL_WEBHOOK_SECRET,
    testRecipient: env.AGENTMAIL_TEST_RECIPIENT,
    allowTestVendorEmails: env.AGENTMAIL_ALLOW_TEST_VENDOR_EMAILS === "true"
  };
}

export function buildAgentMailMessage(rfq: RfqRecord, supplier: SupplierMatch, config = getAgentMailConfig()): AgentMailSendPayload {
  const recipient = (config.testRecipient ?? supplier.vendor.email).trim();
  if (!recipient) {
    throw new Error(`Supplier email is required before issuing RFQ. Update supplier contact for ${supplier.vendor.name}.`);
  }

  if (isExampleRecipient(recipient) && !config.allowTestVendorEmails && !config.testRecipient) {
    throw new Error("AgentMail production send is blocked for example.test vendor emails. Set AGENTMAIL_TEST_RECIPIENT for setup testing or replace seeded vendor emails with real approved recipients.");
  }

  const text = [
    rfq.draft.scope,
    "",
    `Technical specs: ${rfq.draft.technicalSpecs}`,
    "",
    `Commercial terms: ${rfq.draft.commercialTerms.join(" ")}`,
    "",
    `Evaluation criteria: ${rfq.draft.evaluationCriteria.join(", ")}`,
    "",
    `Please respond by ${rfq.draft.responseDeadline}. Include total landed cost, lead time, payment terms, warranty, and exceptions.`
  ].join("\n");

  return {
    to: recipient,
    subject: rfq.draft.title,
    text,
    html: [
      `<p>${escapeHtml(rfq.draft.scope)}</p>`,
      `<p><strong>Technical specs:</strong> ${escapeHtml(rfq.draft.technicalSpecs)}</p>`,
      `<p><strong>Commercial terms:</strong> ${escapeHtml(rfq.draft.commercialTerms.join(" "))}</p>`,
      `<p><strong>Evaluation criteria:</strong> ${escapeHtml(rfq.draft.evaluationCriteria.join(", "))}</p>`,
      `<p>Please respond by ${escapeHtml(rfq.draft.responseDeadline)} with total landed cost, lead time, payment terms, warranty, and exceptions.</p>`
    ].join(""),
    labels: ["jill", "rfq", rfq.id],
    headers: {
      "X-Jill-RFQ-ID": rfq.id,
      "X-Jill-Vendor-ID": supplier.vendor.id
    }
  };
}

export function verifyAgentMailWebhook(rawBody: string, headers: Headers, secret = process.env.AGENTMAIL_WEBHOOK_SECRET): AgentMailEvent {
  if (!secret) {
    throw new Error("AGENTMAIL_WEBHOOK_SECRET is required to verify AgentMail webhooks");
  }

  const webhook = new Webhook(secret);
  return webhook.verify(rawBody, {
    "svix-id": requiredHeader(headers, "svix-id"),
    "svix-timestamp": requiredHeader(headers, "svix-timestamp"),
    "svix-signature": requiredHeader(headers, "svix-signature")
  }) as AgentMailEvent;
}

export function parseAgentMailWebhook(payload: AgentMailEvent): { rfqId?: string; quote?: QuoteInput; ignored?: string } {
  const eventType = payload.event_type ?? payload.type;
  if (eventType && eventType !== "message.received") {
    return { ignored: eventType };
  }

  const headers = normalizeHeaders(payload.message?.headers);
  const rfqId = payload.rfqId ?? payload.message?.metadata?.rfqId ?? headers["x-jill-rfq-id"];
  const text = payload.message?.extracted_text ?? payload.message?.text ?? stripHtml(payload.message?.html ?? "");
  const vendorId =
    payload.vendorId ??
    payload.message?.metadata?.vendorId ??
    headers["x-jill-vendor-id"] ??
    inferVendorId(readSender(payload.message?.from) ?? text);

  if (!text) {
    throw new Error("Inbound AgentMail message has no quote text");
  }

  if (!vendorId) {
    throw new Error("Could not infer vendor for inbound quote");
  }

  return {
    rfqId,
    quote: { vendorId, rawText: text }
  };
}

const mockEmailProviderShim: EmailProvider = {
  async sendRfq(rfq) {
    const { mockEmailProvider } = await import("./mockProvider");
    return mockEmailProvider.sendRfq(rfq);
  }
};

function isExampleRecipient(recipient: string): boolean {
  return /@example\.(test|com|org)$/i.test(recipient);
}

function requiredHeader(headers: Headers, name: string): string {
  const value = headers.get(name);
  if (!value) throw new Error(`Missing AgentMail webhook header: ${name}`);
  return value;
}

function normalizeHeaders(headers?: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key.toLowerCase(), value ?? ""]));
}

function readSender(sender?: string | { email?: string; address?: string }): string | undefined {
  if (!sender) return undefined;
  return typeof sender === "string" ? sender : sender.email ?? sender.address;
}

function inferVendorId(source?: string): string | undefined {
  const lower = (source ?? "").toLowerCase();
  return demoVendors.find((vendor) => {
    const email = vendor.email.trim().toLowerCase();
    return lower.includes(vendor.name.toLowerCase().split(" ")[0]) || (!!email && lower.includes(email));
  })?.id;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
