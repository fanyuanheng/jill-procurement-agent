export type RfqStage = "Buyer Dashboard" | "Structured RFQ Draft" | "Supplier Selection" | "Send" | "Quote Comparison" | "Award & PO Issuance";

export type RfqStatus = "Drafting" | "Sent" | "Quotes In" | "Awaiting Approval" | "PO Issued" | "Review";

export type ComplianceStatus = "Compliant" | "Review" | "Blocked";

export type VendorSource = "Vendor Master" | "External";

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD";

export type RfqLineItem = {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  technicalSpecs: TechnicalSpec[];
};

export type TechnicalSpec = {
  name: string;
  value: string;
  required: boolean;
};

export type Rfq = {
  id: string;
  title: string;
  requester: string;
  department: string;
  stage: RfqStage;
  status: RfqStatus;
  category: string;
  budget: number;
  currency: CurrencyCode;
  neededBy: string;
  shipTo: string;
  lineItems: RfqLineItem[];
  selectedVendorIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type Vendor = {
  id: string;
  name: string;
  source: VendorSource;
  reliabilityPercent: number;
  rating: number;
  complianceStatus: ComplianceStatus;
  pastSpend: number;
  emailAddress: string;
  categories?: string[];
  notes?: string;
};

export type Quote = {
  id: string;
  rfqId: string;
  vendorId: string;
  emailMessageId: string;
  rawBody: string;
  receivedAt: string;
};

export type NormalizedQuote = {
  quoteId: string;
  rfqId: string;
  vendorId: string;
  vendorName: string;
  totalPrice: number;
  currency: CurrencyCode;
  leadTimeDays: number;
  paymentTerms: string;
  warranty: string;
  complianceNotes: string[];
  exceptions: string[];
  confidence: number;
};

export type Recommendation = {
  rfqId: string;
  recommendedVendorId: string;
  recommendedVendorName: string;
  rationale: string;
  estimatedSavings: number;
  risks: string[];
};

export type PurchaseOrder = {
  id: string;
  rfqId: string;
  vendorId: string;
  amount: number;
  currency: CurrencyCode;
  status: "Draft" | "Issued";
  issuedAt: string;
};

export type ActivityEvent = {
  id: string;
  actor: "Jill" | "Buyer" | "Vendor" | "System";
  message: string;
  timestamp: string;
  rfqId?: string;
};

export type EmailMessage = {
  id: string;
  rfqId?: string;
  vendorId?: string;
  direction: "Inbound" | "Outbound";
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  provider: "simulation" | "agentmail";
  status?: "drafted" | "sent" | "received" | "failed";
};

export type DashboardMetrics = {
  annualSavings: number;
  cycleTimeReductionPercent: number;
  hoursRecovered: number;
};

export type RfqCreateInput = Omit<Rfq, "id" | "stage" | "status" | "selectedVendorIds" | "createdAt" | "updatedAt"> & {
  stage?: RfqStage;
  status?: RfqStatus;
  selectedVendorIds?: string[];
};

export type EmailCreateInput = Omit<EmailMessage, "id" | "timestamp" | "status"> & {
  timestamp?: string;
  status?: EmailMessage["status"];
};

export type StoreState = {
  rfqs: Rfq[];
  vendors: Vendor[];
  quotes: Quote[];
  normalizedQuotes: NormalizedQuote[];
  recommendations: Recommendation[];
  purchaseOrders: PurchaseOrder[];
  activityFeed: ActivityEvent[];
  emailMessages: EmailMessage[];
  dashboardMetrics: DashboardMetrics;
};
