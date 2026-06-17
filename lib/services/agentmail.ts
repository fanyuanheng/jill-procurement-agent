import { AgentMailClient } from "agentmail";
import { isSimulation } from "../env";
import { store as singletonStore } from "../store";
import type { PurchaseOrder, Rfq, Vendor } from "../types";

export type AgentMailMode = "simulation" | "live";

export type ProvisionedInbox = {
  inboxId: string;
  emailAddress: string;
  mode: AgentMailMode;
};

export type SentEmailResult = {
  vendorId?: string;
  to: string;
  subject: string;
  messageId: string;
  threadId?: string;
  mode: AgentMailMode;
};

export type RawQuoteReply = {
  vendor: string;
  rawEmailBody: string;
  messageId?: string;
};

export type AgentMailService = {
  provisionJillInbox(): Promise<ProvisionedInbox>;
  sendRfq(rfq: Rfq, vendors: Vendor[]): Promise<SentEmailResult[]>;
  getQuotes(rfqId: string): Promise<RawQuoteReply[]>;
  sendPurchaseOrder(po: PurchaseOrder, vendor: Vendor): Promise<SentEmailResult>;
  flushSimulation(): Promise<void>;
};

export type AgentMailSdkLike = {
  inboxes: {
    create(request?: {
      username?: string;
      domain?: string;
      displayName?: string;
      clientId?: string;
    }): Promise<{ inboxId: string; email: string }>;
    messages: {
      send(
        inboxId: string,
        request: {
          to?: string | string[];
          subject?: string;
          text?: string;
          html?: string;
          cc?: string | string[];
          bcc?: string | string[];
          replyTo?: string;
          labels?: string[];
        }
      ): Promise<{ messageId: string; threadId: string }>;
      list(
        inboxId: string,
        request?: { limit?: number; labels?: string[]; subject?: string[] }
      ): Promise<{ messages: Array<{ messageId: string; from?: string; subject?: string; labels?: string[]; inboxId?: string }> }>;
      get(
        inboxId: string,
        messageId: string
      ): Promise<{
        messageId: string;
        from?: string;
        to?: string[];
        subject?: string;
        text?: string;
        html?: string;
        extractedText?: string;
        extractedHtml?: string;
      }>;
    };
  };
};

type JillStore = typeof singletonStore;

export function getConfiguredJillInboxAddress() {
  return process.env.AGENTMAIL_INBOX_ID || process.env.AGENTMAIL_INBOX_ADDRESS || "bsl-procurement@agentmail.to";
}

export function createAgentMailService({
  mode = isSimulation() ? "simulation" : "live",
  store = singletonStore,
  client,
  inboxId
}: {
  mode?: AgentMailMode;
  store?: JillStore;
  client?: AgentMailSdkLike;
  inboxId?: string;
  simulationDelayMs?: number;
} = {}): AgentMailService {
  let provisionedInbox: ProvisionedInbox | undefined;

  async function provisionJillInbox(): Promise<ProvisionedInbox> {
    const configuredInbox = inboxId || getConfiguredJillInboxAddress();

    if (mode === "simulation") {
      provisionedInbox = { inboxId: configuredInbox, emailAddress: configuredInbox, mode };
      store.recordActivity({ actor: "Jill", message: `Simulation inbox ready at ${configuredInbox}.` });
      return provisionedInbox;
    }

    const sdk = client ?? createLiveClient();
    if (configuredInbox) {
      provisionedInbox = { inboxId: configuredInbox, emailAddress: configuredInbox, mode };
      store.recordActivity({ actor: "Jill", message: `AgentMail inbox ready at ${configuredInbox}.` });
      return provisionedInbox;
    }

    const inbox = await sdk.inboxes.create({
      username: process.env.AGENTMAIL_USERNAME || "bsl-procurement",
      domain: process.env.AGENTMAIL_DOMAIN || "agentmail.to",
      displayName: "Jill - AI Procurement Agent",
      clientId: "jill-procurement-agent-inbox"
    });
    provisionedInbox = { inboxId: inbox.inboxId, emailAddress: inbox.email, mode };
    store.recordActivity({ actor: "Jill", message: `AgentMail inbox provisioned at ${inbox.email}.` });
    return provisionedInbox;
  }

  async function sendRfq(rfq: Rfq, vendors: Vendor[]): Promise<SentEmailResult[]> {
    const inbox = await ensureInbox();
    const subject = `RFQ ${rfq.id}: ${rfq.title}`;
    const body = renderRfqText(rfq);
    const html = renderRfqHtml(rfq);

    if (mode === "simulation") {
      const sent = vendors.map((vendor) => {
        const email = store.addEmailMessage({
          rfqId: rfq.id,
          vendorId: vendor.id,
          direction: "Outbound",
          from: inbox.emailAddress,
          to: vendor.emailAddress,
          subject,
          body,
          provider: "simulation",
          status: "sent"
        });
        return {
          vendorId: vendor.id,
          to: vendor.emailAddress,
          subject,
          messageId: email.id,
          threadId: `simulation-thread-${rfq.id}`,
          mode
        };
      });

      store.recordActivity({ actor: "Jill", message: `RFQ ${rfq.id} sent to ${vendors.length} vendors in simulation.`, rfqId: rfq.id });
      return sent;
    }

    const sdk = client ?? createLiveClient();
    const sent: SentEmailResult[] = [];
    for (const vendor of vendors) {
      const response = await sdk.inboxes.messages.send(inbox.inboxId, {
        to: vendor.emailAddress,
        subject,
        text: body,
        html,
        labels: [`rfq:${rfq.id}`, "rfq-outbound"]
      });
      store.addEmailMessage({
        rfqId: rfq.id,
        vendorId: vendor.id,
        direction: "Outbound",
        from: inbox.emailAddress,
        to: vendor.emailAddress,
        subject,
        body,
        provider: "agentmail",
        status: "sent"
      });
      sent.push({ vendorId: vendor.id, to: vendor.emailAddress, subject, messageId: response.messageId, threadId: response.threadId, mode });
    }
    store.recordActivity({ actor: "Jill", message: `RFQ ${rfq.id} sent through AgentMail to ${vendors.length} vendors.`, rfqId: rfq.id });
    return sent;
  }

  async function getQuotes(rfqId: string): Promise<RawQuoteReply[]> {
    if (mode === "simulation") {
      const storedReplies = store
        .getState()
        .emailMessages.filter((email) => email.rfqId === rfqId && email.direction === "Inbound")
        .map((email) => ({
          vendor: vendorName(email.vendorId, email.from),
          rawEmailBody: email.body,
          messageId: email.id
        }));
      if (storedReplies.length) {
        store.recordActivity({ actor: "Jill", message: `Loaded ${storedReplies.length} stored quote replies for RFQ ${rfqId}.`, rfqId });
        return storedReplies;
      }

      store.recordActivity({ actor: "Jill", message: `No stored quote replies are available for RFQ ${rfqId}.`, rfqId });
      return [];
    }

    const inbox = await ensureInbox();
    const sdk = client ?? createLiveClient();
    const labeledResponse = await sdk.inboxes.messages.list(inbox.inboxId, {
      limit: 50,
      labels: [`rfq:${rfqId}`]
    });
    const labeledMatches = labeledResponse.messages.filter((item) => isInboundQuoteMessage(item, rfqId, inbox.emailAddress));
    const candidateMessages = labeledMatches.length
      ? labeledMatches
      : (
          await sdk.inboxes.messages.list(inbox.inboxId, {
            limit: 50,
            subject: [rfqId]
          })
        ).messages.filter((item) => isInboundQuoteMessage(item, rfqId, inbox.emailAddress));

    const replies: RawQuoteReply[] = [];
    for (const item of candidateMessages) {
      const message = await sdk.inboxes.messages.get(inbox.inboxId, item.messageId);
      if (isFromJill(message.from, inbox.emailAddress)) continue;
      const rawEmailBody = message.extractedText || message.text || message.extractedHtml || message.html || "";
      if (!rawEmailBody.trim()) continue;
      const vendor = message.from ?? item.from ?? "Unknown vendor";
      recordInboundQuoteIfMissing(store, rfqId, vendor, message.subject ?? item.subject ?? `Re: RFQ ${rfqId}`, rawEmailBody);
      replies.push({ vendor, rawEmailBody, messageId: item.messageId });
    }
    store.recordActivity({ actor: "Jill", message: `Read ${replies.length} AgentMail quote replies for RFQ ${rfqId}.`, rfqId });
    return replies;
  }

  async function sendPurchaseOrder(po: PurchaseOrder, vendor: Vendor): Promise<SentEmailResult> {
    const inbox = await ensureInbox();
    const subject = `Purchase Order ${po.id} for RFQ ${po.rfqId}`;
    const text = renderPoText(po, vendor);
    const html = `<p>${escapeHtml(text).replaceAll("\n", "<br />")}</p>`;

    if (mode === "simulation") {
      const email = store.addEmailMessage({
        rfqId: po.rfqId,
        vendorId: vendor.id,
        direction: "Outbound",
        from: inbox.emailAddress,
        to: vendor.emailAddress,
        subject,
        body: text,
        provider: "simulation",
        status: "sent"
      });
      store.recordActivity({ actor: "Jill", message: `Simulation PO ${po.id} emailed to ${vendor.name}.`, rfqId: po.rfqId });
      return { vendorId: vendor.id, to: vendor.emailAddress, subject, messageId: email.id, threadId: `simulation-thread-${po.rfqId}`, mode };
    }

    const sdk = client ?? createLiveClient();
    const response = await sdk.inboxes.messages.send(inbox.inboxId, {
      to: vendor.emailAddress,
      subject,
      text,
      html,
      labels: [`rfq:${po.rfqId}`, "po-issued"]
    });
    store.addEmailMessage({
      rfqId: po.rfqId,
      vendorId: vendor.id,
      direction: "Outbound",
      from: inbox.emailAddress,
      to: vendor.emailAddress,
      subject,
      body: text,
      provider: "agentmail",
      status: "sent"
    });
    store.recordActivity({ actor: "Jill", message: `PO ${po.id} sent through AgentMail to ${vendor.name}.`, rfqId: po.rfqId });
    return { vendorId: vendor.id, to: vendor.emailAddress, subject, messageId: response.messageId, threadId: response.threadId, mode };
  }

  async function flushSimulation() {
    await Promise.resolve();
  }

  async function ensureInbox() {
    return provisionedInbox ?? provisionJillInbox();
  }

  return { provisionJillInbox, sendRfq, getQuotes, sendPurchaseOrder, flushSimulation };
}

export const agentMailService = createAgentMailService();

export async function ingestInboundAgentMailEvent(payload: unknown, store: JillStore = singletonStore) {
  const event = payload as Record<string, unknown>;
  const eventType = String(event.event_type ?? event.eventType ?? "");
  if (eventType && eventType !== "message.received") {
    return { stored: false, reason: `Ignored event type ${eventType}` };
  }

  const rawMessage = (event.message ?? event.data ?? event) as Record<string, unknown>;
  const labels = toStringArray(rawMessage.labels);
  const subject = String(rawMessage.subject ?? "");
  const rfqId = findRfqId(labels, subject);
  const body = String(rawMessage.extracted_text ?? rawMessage.extractedText ?? rawMessage.text ?? rawMessage.extracted_html ?? rawMessage.extractedHtml ?? rawMessage.html ?? "");

  store.addEmailMessage({
    rfqId,
    direction: "Inbound",
    from: String(rawMessage.from ?? ""),
    to: toStringArray(rawMessage.to).join(", ") || getConfiguredJillInboxAddress(),
    subject,
    body,
    timestamp: String(rawMessage.timestamp ?? new Date().toISOString()),
    provider: "agentmail",
    status: "received"
  });
  store.recordActivity({ actor: "Jill", message: `Inbound AgentMail quote received${rfqId ? ` for RFQ ${rfqId}` : ""}.`, rfqId });
  return { stored: true, rfqId };
}

function createLiveClient(): AgentMailSdkLike {
  if (!process.env.AGENTMAIL_API_KEY) {
    throw new Error("AGENTMAIL_API_KEY is required for DEMO_MODE=live");
  }
  return new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY }) as unknown as AgentMailSdkLike;
}

function renderRfqText(rfq: Rfq) {
  const lines = rfq.lineItems.flatMap((line) => [
    `- ${line.quantity} ${line.unit} ${line.description}`,
    ...line.technicalSpecs.map((spec) => `  - ${spec.name}: ${spec.value}${spec.required ? " (required)" : ""}`)
  ]);
  return [
    `Jill RFQ ${rfq.id}`,
    "",
    `Title: ${rfq.title}`,
    `Category: ${rfq.category}`,
    `Needed by: ${rfq.neededBy}`,
    `Ship to: ${rfq.shipTo}`,
    `Budget ceiling: ${rfq.currency} ${rfq.budget}`,
    "",
    "Line items:",
    ...lines,
    "",
    "Please reply with unit price, quantity, total price, lead time, warranty, certifications, payment terms, and exceptions."
  ].join("\n");
}

function renderRfqHtml(rfq: Rfq) {
  return `<h2>Jill RFQ ${escapeHtml(rfq.id)}: ${escapeHtml(rfq.title)}</h2><pre>${escapeHtml(renderRfqText(rfq))}</pre>`;
}

function renderPoText(po: PurchaseOrder, vendor: Vendor) {
  return [
    `Purchase Order ${po.id}`,
    "",
    `Vendor: ${vendor.name}`,
    `RFQ: ${po.rfqId}`,
    `Amount: ${po.currency} ${po.amount}`,
    `Status: ${po.status}`,
    `Issued at: ${po.issuedAt}`,
    "",
    "Please confirm receipt and expected fulfillment date."
  ].join("\n");
}

function vendorName(vendorId: string | undefined, fallback: string) {
  if (!vendorId) return fallback;
  return singletonStore.getVendor(vendorId)?.name ?? fallback;
}

function isInboundQuoteMessage(message: { labels?: string[]; subject?: string; from?: string }, rfqId: string, inboxAddress: string) {
  const labels = message.labels ?? [];
  if (labels.includes("sent") || labels.includes("rfq-outbound")) return false;
  if (isFromJill(message.from, inboxAddress)) return false;
  return messageMatchesRfq(message, rfqId);
}

function isFromJill(from: string | undefined, inboxAddress: string) {
  if (!from) return false;
  return from.trim().toLowerCase() === inboxAddress.trim().toLowerCase();
}

function messageMatchesRfq(message: { labels?: string[]; subject?: string }, rfqId: string) {
  return message.labels?.includes(`rfq:${rfqId}`) || message.subject?.includes(rfqId);
}

function recordInboundQuoteIfMissing(store: JillStore, rfqId: string, from: string, subject: string, body: string) {
  const vendorId = inferVendorIdFromSender(store, rfqId, from);
  const existing = store
    .getState()
    .emailMessages.some((email) => email.rfqId === rfqId && email.direction === "Inbound" && email.from === from && email.subject === subject && email.body === body);
  if (existing) return;

  store.addEmailMessage({
    rfqId,
    vendorId,
    direction: "Inbound",
    from,
    to: getConfiguredJillInboxAddress(),
    subject,
    body,
    provider: "agentmail",
    status: "received"
  });
}

function inferVendorIdFromSender(store: JillStore, rfqId: string, from: string) {
  const state = store.getState();
  const rfq = state.rfqs.find((candidate) => candidate.id === rfqId);
  const sender = normalizeEmailAddress(from);
  if (!rfq || !sender) return undefined;
  return state.vendors.find((vendor) => rfq.selectedVendorIds.includes(vendor.id) && normalizeEmailAddress(vendor.emailAddress) === sender)?.id;
}

function normalizeEmailAddress(value: string | undefined) {
  return value?.trim().toLowerCase().replace(/^.*<([^>]+)>.*$/, "$1") ?? "";
}

function findRfqId(labels: string[], subject: string) {
  const label = labels.find((candidate) => candidate.startsWith("rfq:"));
  if (label) return label.slice(4);
  const marker = "rfq";
  const lower = subject.toLowerCase();
  const start = lower.indexOf(marker);
  if (start === -1) return undefined;
  const afterMarker = subject.slice(start + marker.length).trimStart();
  const separators = new Set(["-", ":", " "]);
  const idStart = separators.has(afterMarker[0]) ? afterMarker.slice(1).trimStart() : afterMarker;
  return idStart.split(" ")[0] || undefined;
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return [value];
  return [];
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
