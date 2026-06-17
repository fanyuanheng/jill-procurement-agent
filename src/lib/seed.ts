import type { ProcurementRequest, QuoteInput, Vendor } from "./types";

export const demoRequest: ProcurementRequest = {
  title: "Replacement high-pressure pump package",
  category: "Rotating Equipment",
  neededBy: "2026-07-15",
  budget: 185000,
  shipTo: "Basin Field Station 4",
  requirements:
    "Need API 610 compliant pump package, stainless wetted parts, VFD, commissioning support, and delivery before shutdown window."
};

export const demoVendors: Vendor[] = [
  {
    id: "vendor-northstar",
    name: "Northstar Industrial Supply",
    email: "",
    categories: ["Rotating Equipment", "Industrial MRO"],
    regions: ["US-West", "US-Central"],
    reliability: 94,
    diversityStatus: "WBE",
    paymentTerms: "Net 30",
    averageLeadTimeDays: 32,
    riskNotes: []
  },
  {
    id: "vendor-cascade",
    name: "Cascade MRO Partners",
    email: "",
    categories: ["Rotating Equipment", "Field Services"],
    regions: ["US-West"],
    reliability: 91,
    paymentTerms: "Net 30",
    averageLeadTimeDays: 24,
    riskNotes: ["Single-region delivery risk"]
  },
  {
    id: "vendor-apex",
    name: "Apex Energy Components",
    email: "",
    categories: ["Rotating Equipment", "Electrical"],
    regions: ["US-West", "US-Central", "US-East"],
    reliability: 86,
    diversityStatus: "SBE",
    paymentTerms: "Net 45",
    averageLeadTimeDays: 48,
    riskNotes: ["Longer historical lead times"]
  },
  {
    id: "vendor-harbor",
    name: "Harbor Controls Group",
    email: "",
    categories: ["Automation", "Electrical"],
    regions: ["US-West"],
    reliability: 89,
    paymentTerms: "Net 30",
    averageLeadTimeDays: 30,
    riskNotes: []
  }
];

export const mockQuoteInputs: QuoteInput[] = [
  {
    vendorId: "vendor-northstar",
    rawText:
      "We can supply the pump package for $164,200. Lead time 28 days. Net 30. Warranty 24 months. Exception: commissioning travel billed at cost."
  },
  {
    vendorId: "vendor-cascade",
    rawText:
      "Cascade quote: total $171,400, lead time 21 days after PO, Net 30, warranty 36 months. No exceptions."
  },
  {
    vendorId: "vendor-apex",
    rawText:
      "Apex price is $158,900. Lead time 52 days. Net 45. Warranty 18 months. No exceptions."
  }
];
