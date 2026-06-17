import { dashboardMetrics, buildSeedActivity, messyQuoteEmails, seedRfqs, seedVendors } from "./seed";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  ActivityEvent,
  EmailCreateInput,
  EmailMessage,
  NormalizedQuote,
  PurchaseOrder,
  Quote,
  Recommendation,
  Rfq,
  RfqCreateInput,
  StoreState,
  Vendor
} from "./types";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function initialState(): StoreState {
  return {
    rfqs: clone(seedRfqs),
    vendors: clone(seedVendors),
    quotes: messyQuoteEmails.map((email) => ({
      id: `quote-${email.vendorId}`,
      rfqId: email.rfqId!,
      vendorId: email.vendorId!,
      emailMessageId: email.id,
      rawBody: email.body,
      receivedAt: email.timestamp
    })),
    normalizedQuotes: [],
    recommendations: [],
    purchaseOrders: [],
    activityFeed: buildSeedActivity(),
    emailMessages: clone(messyQuoteEmails),
    dashboardMetrics: clone(dashboardMetrics)
  };
}

function defaultSqlitePath() {
  return process.env.SQLITE_PATH || process.env.DATABASE_URL?.replace(/^sqlite:/, "") || "data/jill.sqlite";
}

export function createInMemoryStore(seed: StoreState = initialState()) {
  let state = clone(seed);

  function recordActivity(event: Omit<ActivityEvent, "id" | "timestamp"> & Partial<Pick<ActivityEvent, "id" | "timestamp">>) {
    const activity: ActivityEvent = {
      id: event.id ?? id("activity"),
      timestamp: event.timestamp ?? now(),
      actor: event.actor,
      message: event.message,
      rfqId: event.rfqId
    };
    state.activityFeed.push(activity);
    return clone(activity);
  }

  function getState(): StoreState {
    return clone(state);
  }

  function reset() {
    state = initialState();
    return getState();
  }

  function listRfqs() {
    return clone(state.rfqs);
  }

  function getRfq(rfqId: string) {
    const rfq = state.rfqs.find((candidate) => candidate.id === rfqId);
    return rfq ? clone(rfq) : undefined;
  }

  function createRfq(input: RfqCreateInput): Rfq {
    const timestamp = now();
    const rfq: Rfq = {
      ...input,
      id: id("rfq"),
      stage: input.stage ?? "Structured RFQ Draft",
      status: input.status ?? "Drafting",
      selectedVendorIds: input.selectedVendorIds ?? [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.rfqs.unshift(rfq);
    recordActivity({ actor: "Jill", message: `RFQ drafted for ${rfq.title}.`, rfqId: rfq.id });
    return clone(rfq);
  }

  function updateRfq(rfqId: string, patch: Partial<Omit<Rfq, "id" | "createdAt">>) {
    const index = state.rfqs.findIndex((candidate) => candidate.id === rfqId);
    if (index === -1) throw new Error(`RFQ not found: ${rfqId}`);
    state.rfqs[index] = { ...state.rfqs[index], ...patch, updatedAt: now() };
    return clone(state.rfqs[index]);
  }

  function deleteRfq(rfqId: string) {
    const index = state.rfqs.findIndex((candidate) => candidate.id === rfqId);
    if (index === -1) return undefined;
    const [deleted] = state.rfqs.splice(index, 1);
    state.quotes = state.quotes.filter((quote) => quote.rfqId !== rfqId);
    state.normalizedQuotes = state.normalizedQuotes.filter((quote) => quote.rfqId !== rfqId);
    state.recommendations = state.recommendations.filter((recommendation) => recommendation.rfqId !== rfqId);
    state.purchaseOrders = state.purchaseOrders.filter((po) => po.rfqId !== rfqId);
    state.emailMessages = state.emailMessages.filter((email) => email.rfqId !== rfqId);
    state.activityFeed = state.activityFeed.filter((event) => event.rfqId !== rfqId);
    recordActivity({ actor: "Buyer", message: `RFQ deleted: ${deleted.title}.` });
    return clone(deleted);
  }

  function listVendors() {
    return clone(state.vendors);
  }

  function getVendor(vendorId: string) {
    const vendor = state.vendors.find((candidate) => candidate.id === vendorId);
    return vendor ? clone(vendor) : undefined;
  }

  function createVendor(input: Omit<Vendor, "id"> & { id?: string }) {
    const vendor: Vendor = {
      ...input,
      id: input.id ?? id("vendor")
    };
    state.vendors.push(vendor);
    recordActivity({ actor: "Buyer", message: `Vendor added: ${vendor.name}.` });
    return clone(vendor);
  }

  function updateVendor(vendorId: string, patch: Partial<Omit<Vendor, "id">>) {
    const index = state.vendors.findIndex((candidate) => candidate.id === vendorId);
    if (index === -1) throw new Error(`Vendor not found: ${vendorId}`);
    state.vendors[index] = { ...state.vendors[index], ...patch };
    recordActivity({ actor: "Buyer", message: `Vendor details updated for ${state.vendors[index].name}.` });
    return clone(state.vendors[index]);
  }

  function addQuote(input: Omit<Quote, "id">) {
    const quote: Quote = { ...input, id: id("quote") };
    state.quotes.push(quote);
    recordActivity({ actor: "Vendor", message: `Quote captured from ${getVendor(input.vendorId)?.name ?? input.vendorId}.`, rfqId: input.rfqId });
    return clone(quote);
  }

  function listQuotes(rfqId?: string) {
    const quotes = rfqId ? state.quotes.filter((quote) => quote.rfqId === rfqId) : state.quotes;
    return clone(quotes);
  }

  function upsertNormalizedQuote(quote: NormalizedQuote) {
    const index = state.normalizedQuotes.findIndex((candidate) => candidate.quoteId === quote.quoteId);
    if (index === -1) state.normalizedQuotes.push(quote);
    else state.normalizedQuotes[index] = quote;
    recordActivity({ actor: "Jill", message: `Quote normalized for ${quote.vendorName}.`, rfqId: quote.rfqId });
    return clone(quote);
  }

  function saveRecommendation(recommendation: Recommendation) {
    const index = state.recommendations.findIndex((candidate) => candidate.rfqId === recommendation.rfqId);
    if (index === -1) state.recommendations.push(recommendation);
    else state.recommendations[index] = recommendation;
    recordActivity({ actor: "Jill", message: `Recommendation prepared for ${recommendation.recommendedVendorName}.`, rfqId: recommendation.rfqId });
    return clone(recommendation);
  }

  function savePurchaseOrder(po: PurchaseOrder) {
    const index = state.purchaseOrders.findIndex((candidate) => candidate.id === po.id);
    if (index === -1) state.purchaseOrders.push(po);
    else state.purchaseOrders[index] = po;
    recordActivity({ actor: "Buyer", message: `Purchase order ${po.id} ${po.status.toLowerCase()}.`, rfqId: po.rfqId });
    return clone(po);
  }

  function addEmailMessage(input: EmailCreateInput): EmailMessage {
    const email: EmailMessage = {
      ...input,
      id: id("email"),
      timestamp: input.timestamp ?? now(),
      status: input.status ?? (input.direction === "Inbound" ? "received" : "sent")
    };
    state.emailMessages.push(email);
    recordActivity({ actor: input.direction === "Inbound" ? "Vendor" : "Jill", message: `${input.direction} email recorded: ${input.subject}.`, rfqId: input.rfqId });
    return clone(email);
  }

  function listActivity() {
    return clone(state.activityFeed);
  }

  return {
    getState,
    reset,
    listRfqs,
    getRfq,
    createRfq,
    updateRfq,
    deleteRfq,
    listVendors,
    getVendor,
    createVendor,
    updateVendor,
    addQuote,
    listQuotes,
    upsertNormalizedQuote,
    saveRecommendation,
    savePurchaseOrder,
    addEmailMessage,
    recordActivity,
    listActivity
  };
}

type InMemoryStore = ReturnType<typeof createInMemoryStore>;

export function createSqliteStore(dbPath = defaultSqlitePath()): InMemoryStore {
  const directory = dirname(dbPath);
  if (directory && directory !== "." && !existsSync(directory)) mkdirSync(directory, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get("store") as { value: string } | undefined;
  const memoryStore = createInMemoryStore(row ? (JSON.parse(row.value) as StoreState) : initialState());

  if (!row) persist(memoryStore.getState());

  function persist(state: StoreState) {
    db.prepare(`
      INSERT INTO app_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run("store", JSON.stringify(state), new Date().toISOString());
  }

  function persistAfter<T>(operation: () => T): T {
    const result = operation();
    persist(memoryStore.getState());
    return result;
  }

  return {
    ...memoryStore,
    reset: () => persistAfter(() => memoryStore.reset()),
    createRfq: (input) => persistAfter(() => memoryStore.createRfq(input)),
    updateRfq: (rfqId, patch) => persistAfter(() => memoryStore.updateRfq(rfqId, patch)),
    deleteRfq: (rfqId) => persistAfter(() => memoryStore.deleteRfq(rfqId)),
    createVendor: (input) => persistAfter(() => memoryStore.createVendor(input)),
    updateVendor: (vendorId, patch) => persistAfter(() => memoryStore.updateVendor(vendorId, patch)),
    addQuote: (input) => persistAfter(() => memoryStore.addQuote(input)),
    upsertNormalizedQuote: (quote) => persistAfter(() => memoryStore.upsertNormalizedQuote(quote)),
    saveRecommendation: (recommendation) => persistAfter(() => memoryStore.saveRecommendation(recommendation)),
    savePurchaseOrder: (po) => persistAfter(() => memoryStore.savePurchaseOrder(po)),
    addEmailMessage: (input) => persistAfter(() => memoryStore.addEmailMessage(input)),
    recordActivity: (event) => persistAfter(() => memoryStore.recordActivity(event))
  };
}

export const store = createSqliteStore();
