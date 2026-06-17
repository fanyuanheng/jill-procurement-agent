import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { buildRfqDraft, generatePo, matchSuppliers, normalizeQuote, recommendAward } from "./rfq";
import { demoVendors } from "./seed";
import type { AppState, AuditEvent, EmailRecord, OperationalException, ProcurementRequest, QuoteInput, RfqRecord, Vendor } from "./types";

const DEFAULT_PATH = join(process.cwd(), "data", "jill-state.json");
const REMOVED_DEFAULT_EMAIL = "yuanheng.fan@alvarezandmarsal.com";

export function createJsonStore(filePath = DEFAULT_PATH) {
  async function getState(): Promise<AppState> {
    try {
      const raw = await readFile(filePath, "utf8");
      return normalizeState(JSON.parse(raw) as Partial<AppState>);
    } catch {
      const initial = initialState();
      await save(initial);
      return initial;
    }
  }

  async function save(state: AppState): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(state, null, 2));
  }

  async function reset(): Promise<AppState> {
    const state: AppState = { ...initialState(), audit: [audit("system", "Demo workspace reset for a fresh procurement cycle.")] };
    await save(state);
    return state;
  }

  async function createRfq(request: ProcurementRequest): Promise<RfqRecord> {
    const state = await getState();
    const now = new Date().toISOString();
    const rfq: RfqRecord = {
      id: `rfq-${Date.now()}`,
      createdAt: now,
      request,
      draft: buildRfqDraft(request),
      suppliers: matchSuppliers(request, state.vendors),
      quotes: [],
      status: "rfq_ready"
    };

    state.rfqs.unshift(rfq);
    state.activeRfqId = rfq.id;
    state.audit.push(audit("jill", `RFQ package generated for "${request.title}" and ${rfq.suppliers.length} recommended suppliers identified.`));
    await save(state);
    return rfq;
  }

  async function recordOutreach(rfqId: string, sentEmails?: EmailRecord[]): Promise<RfqRecord> {
    const state = await getState();
    const rfq = findRfq(state, rfqId);
    rfq.status = "issued";

    state.emails.push(...(sentEmails ?? buildOutreachEmails(rfq)));

    state.audit.push(audit("jill", `RFQ issued to ${rfq.suppliers.length} shortlisted suppliers. Awaiting supplier responses.`));
    await save(state);
    return rfq;
  }

  async function addQuotes(rfqId: string, inputs: QuoteInput[]): Promise<RfqRecord> {
    const state = await getState();
    const rfq = findRfq(state, rfqId);
    const quotes = inputs.map((input) => normalizeQuote(input, state.vendors));

    rfq.quotes = dedupeQuotes([...rfq.quotes, ...quotes]);
    rfq.recommendation = recommendAward(rfq.quotes, state.vendors);
    rfq.status = "award_pending";

    for (const quote of quotes) {
      state.emails.push({
        id: `inbound-${rfq.id}-${quote.vendorId}-${Date.now()}`,
        at: new Date().toISOString(),
        direction: "inbound",
        provider: "mock",
        vendorId: quote.vendorId,
        from: state.vendors.find((vendor) => vendor.id === quote.vendorId)?.email,
        subject: `Re: ${rfq.draft.title}`,
        body: quote.rawText,
        status: "received"
      });
    }

    state.audit.push(audit("jill", `Supplier bids normalized and sourcing recommendation prepared for ${rfq.recommendation.vendorName}.`));
    await save(state);
    return rfq;
  }

  async function award(rfqId: string, vendorId: string): Promise<RfqRecord> {
    const state = await getState();
    const rfq = findRfq(state, rfqId);
    const quote = rfq.quotes.find((candidate) => candidate.vendorId === vendorId);
    if (!quote) throw new Error("Cannot award RFQ without a quote from the selected vendor");

    rfq.po = generatePo(rfq.id, quote);
    rfq.status = "po_issued";
    state.audit.push(audit("buyer", `Supplier award approved for ${quote.vendorName}; purchase order ${rfq.po.id} generated.`));
    await save(state);
    return rfq;
  }

  async function setActiveRfq(rfqId: string): Promise<AppState> {
    const state = await getState();
    findRfq(state, rfqId);
    state.activeRfqId = rfqId;
    await save(state);
    return state;
  }

  async function updateVendorEmail(vendorId: string, email: string): Promise<Vendor> {
    const state = await getState();
    const vendor = state.vendors.find((candidate) => candidate.id === vendorId);
    if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);
    vendor.email = email;
    state.audit.push(audit("buyer", `Supplier contact updated for ${vendor.name}.`));
    await save(state);
    return vendor;
  }

  async function recordException(rfqId: string | undefined, message: string, type: OperationalException["type"] = "system"): Promise<OperationalException> {
    const state = await getState();
    if (rfqId) {
      const rfq = findRfq(state, rfqId);
      rfq.status = "exception";
    }
    const exception: OperationalException = {
      id: `exception-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      rfqId,
      type,
      message,
      status: "open",
      createdAt: new Date().toISOString()
    };
    state.exceptions.unshift(exception);
    state.audit.push(audit("system", `Exception recorded: ${message}`));
    await save(state);
    return exception;
  }

  async function addManualQuote(rfqId: string, input: QuoteInput): Promise<RfqRecord> {
    const state = await getState();
    const rfq = findRfq(state, rfqId);
    const quote = normalizeQuote(input, state.vendors);
    rfq.quotes = dedupeQuotes([...rfq.quotes, quote]);
    rfq.recommendation = recommendAward(rfq.quotes, state.vendors);
    rfq.status = "award_pending";
    state.emails.push({
      id: `manual-${rfq.id}-${quote.vendorId}-${Date.now()}`,
      at: new Date().toISOString(),
      direction: "inbound",
      provider: "mock",
      vendorId: quote.vendorId,
      from: state.vendors.find((vendor) => vendor.id === quote.vendorId)?.email,
      subject: `Manual bid entry: ${rfq.draft.title}`,
      body: quote.rawText,
      status: "received"
    });
    state.audit.push(audit("buyer", `Manual supplier bid captured for ${quote.vendorName}.`));
    await save(state);
    return rfq;
  }

  return { getState, reset, createRfq, recordOutreach, addQuotes, award, setActiveRfq, updateVendorEmail, recordException, addManualQuote };
}

export const store = createJsonStore();

function initialState(): AppState {
  return {
    activeRfqId: undefined,
    rfqs: [],
    vendors: normalizeVendors(structuredClone(demoVendors)),
    emails: [],
    exceptions: [],
    audit: []
  };
}

function normalizeState(state: Partial<AppState>): AppState {
  return {
    activeRfqId: state.activeRfqId,
    rfqs: state.rfqs ?? [],
    vendors: normalizeVendors(state.vendors ?? structuredClone(demoVendors)),
    emails: state.emails ?? [],
    exceptions: state.exceptions ?? [],
    audit: state.audit ?? []
  };
}

function normalizeVendors(vendors: Vendor[]): Vendor[] {
  return vendors.map((vendor) => ({
    ...vendor,
    email: vendor.email.trim().toLowerCase() === REMOVED_DEFAULT_EMAIL ? "" : vendor.email
  }));
}

function findRfq(state: AppState, rfqId: string): RfqRecord {
  const rfq = state.rfqs.find((candidate) => candidate.id === rfqId);
  if (!rfq) throw new Error(`RFQ not found: ${rfqId}`);
  return rfq;
}

function audit(actor: AuditEvent["actor"], message: string): AuditEvent {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: new Date().toISOString(),
    actor,
    message
  };
}

function dedupeQuotes(quotes: AppState["rfqs"][number]["quotes"]) {
  const byVendor = new Map(quotes.map((quote) => [quote.vendorId, quote]));
  return [...byVendor.values()];
}

function buildOutreachEmails(rfq: RfqRecord): EmailRecord[] {
  return rfq.suppliers.map((supplier) => ({
    id: `email-${rfq.id}-${supplier.vendor.id}`,
    at: new Date().toISOString(),
    direction: "outbound",
    provider: "mock",
    vendorId: supplier.vendor.id,
    to: supplier.vendor.email,
    subject: rfq.draft.title,
    body: `${rfq.draft.scope}\n\nTechnical specs: ${rfq.draft.technicalSpecs}\n\nPlease respond by ${rfq.draft.responseDeadline}.`,
    status: "sent"
  }));
}
