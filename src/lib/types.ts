export type ProcurementRequest = {
  title: string;
  category: string;
  neededBy: string;
  budget: number;
  shipTo: string;
  requirements: string;
};

export type RfqStatus = "intake" | "rfq_ready" | "issued" | "responses_received" | "award_pending" | "po_issued" | "exception";

export type RfqDraft = {
  title: string;
  scope: string;
  technicalSpecs: string;
  commercialTerms: string[];
  evaluationCriteria: string[];
  responseDeadline: string;
};

export type Vendor = {
  id: string;
  name: string;
  email: string;
  categories: string[];
  regions: string[];
  reliability: number;
  diversityStatus?: string;
  paymentTerms: string;
  averageLeadTimeDays: number;
  riskNotes: string[];
};

export type SupplierMatch = {
  vendor: Vendor;
  score: number;
  rationale: string;
  complianceFlags: string[];
};

export type QuoteInput = {
  vendorId: string;
  rawText: string;
};

export type NormalizedQuote = {
  id: string;
  vendorId: string;
  vendorName: string;
  rawText: string;
  totalPrice: number;
  leadTimeDays: number;
  paymentTerms: string;
  warrantyMonths: number;
  exceptions: string[];
  confidence: number;
  riskNotes: string[];
};

export type AwardRecommendation = {
  vendorId: string;
  vendorName: string;
  score: number;
  reason: string;
  tradeoffs: string[];
};

export type AuditEvent = {
  id: string;
  at: string;
  actor: "buyer" | "jill" | "vendor" | "system";
  message: string;
};

export type EmailRecord = {
  id: string;
  at: string;
  direction: "outbound" | "inbound";
  provider?: "mock" | "agentmail";
  providerThreadId?: string;
  vendorId?: string;
  to?: string;
  from?: string;
  subject: string;
  body: string;
  status: "drafted" | "sent" | "received" | "failed";
};

export type OperationalException = {
  id: string;
  rfqId?: string;
  type: "email" | "quote" | "supplier" | "system";
  message: string;
  status: "open" | "resolved";
  createdAt: string;
};

export type PurchaseOrder = {
  id: string;
  rfqId: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  deliveryDate: string;
  status: "issued";
  createdAt: string;
};

export type RfqRecord = {
  id: string;
  createdAt: string;
  request: ProcurementRequest;
  draft: RfqDraft;
  suppliers: SupplierMatch[];
  quotes: NormalizedQuote[];
  recommendation?: AwardRecommendation;
  status: RfqStatus;
  po?: PurchaseOrder;
};

export type AppState = {
  activeRfqId?: string;
  rfqs: RfqRecord[];
  vendors: Vendor[];
  emails: EmailRecord[];
  exceptions: OperationalException[];
  audit: AuditEvent[];
};
