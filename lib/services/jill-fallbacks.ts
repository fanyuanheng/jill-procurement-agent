import { messyQuoteEmails, seedRfqs, seedVendors } from "../seed";
import type { Rfq } from "../types";

export type StructuredRfqResult = {
  title: string;
  category: string;
  quantity: number | null;
  technicalSpecs: { label: string; value: string }[];
  requiredDeliveryDate: string | null;
  budgetCeiling: number | null;
  complianceNotes: string[];
  fieldsNeedingBuyerConfirmation: string[];
};

export type QuoteNormalizeInput = {
  rfq: Rfq | Record<string, unknown>;
  quotes: { vendor: string; rawEmailBody: string }[];
};

export type NormalizedQuoteRow = {
  vendorName: string;
  unitPriceUsd: number | null;
  quantity: number | null;
  totalPriceUsd: number | null;
  leadTimeWeeks: number | null;
  warranty: string | null;
  certifications: string[];
  paymentTerms: string | null;
  complianceCheck: string;
  flags: string[];
};

export type NormalizeQuotesResult = {
  quotes: NormalizedQuoteRow[];
  recommendation: {
    vendorName: string;
    rationale: string;
    savingsVsAverage: number;
  };
};

export function fallbackStructuredRfq(freeFormText = ""): StructuredRfqResult {
  const seeded = seedRfqs.find((rfq) => rfq.id === "rfq-pump-610") ?? seedRfqs[0];
  const line = seeded?.lineItems[0];
  const lower = freeFormText.toLowerCase();
  const inferredSpecs = [
    lower.includes("api 610") || lower.includes("api-610") ? { label: "Standard", value: "API 610" } : null,
    lower.includes("stainless") ? { label: "Wetted parts", value: "Stainless steel" } : null,
    lower.includes("vfd") ? { label: "Drive", value: "VFD included" } : null,
    lower.includes("startup") || lower.includes("commission") ? { label: "Support", value: "Startup or commissioning support" } : null
  ].filter((spec): spec is { label: string; value: string } => Boolean(spec));
  return {
    title: lower.includes("pump") ? "API 610 pump package replacement" : "Structured procurement request",
    category: seeded?.category ?? "General Procurement",
    quantity: line?.quantity ?? null,
    technicalSpecs: inferredSpecs.length ? inferredSpecs : (line?.technicalSpecs ?? []).map((spec) => ({ label: spec.name, value: spec.value })),
    requiredDeliveryDate: seeded?.neededBy ?? null,
    budgetCeiling: seeded?.budget ?? null,
    complianceNotes: ["Validate supplier compliance status before award", "Confirm commercial exceptions before issuing PO"],
    fieldsNeedingBuyerConfirmation: ["Incoterms", "Freight responsibility", "Approved payment terms", "On-site commissioning window"]
  };
}

export function fallbackNormalizeQuotes(input?: QuoteNormalizeInput): NormalizeQuotesResult {
  const vendorNames = new Set(seedVendors.map((vendor) => vendor.name));
  const quoteInputs = input?.quotes?.length
    ? input.quotes
    : messyQuoteEmails.map((email) => ({
        vendor: seedVendors.find((vendor) => vendor.id === email.vendorId)?.name ?? email.from,
        rawEmailBody: email.body
      }));

  const rows = quoteInputs.map((quote) => normalizeFallbackRow(quote.vendor, quote.rawEmailBody));
  const pricedRows = rows.filter((row): row is NormalizedQuoteRow & { totalPriceUsd: number } => typeof row.totalPriceUsd === "number");
  const average = pricedRows.length ? pricedRows.reduce((sum, row) => sum + row.totalPriceUsd, 0) / pricedRows.length : 0;
  const eligible = pricedRows.filter((row) => !row.flags.includes("partial bid") && !row.flags.includes("compliance ambiguity"));
  const winner = eligible.sort((a, b) => scoreFallbackRow(a) - scoreFallbackRow(b))[0] ?? pricedRows[0] ?? rows[0];

  return {
    quotes: rows.map((row) => ({
      ...row,
      vendorName: vendorNames.has(row.vendorName) ? row.vendorName : row.vendorName.trim()
    })),
    recommendation: {
      vendorName: winner?.vendorName ?? "No compliant bid",
      rationale: winner
        ? `${winner.vendorName} is the fallback recommendation because it has the strongest mix of price, compliance, and delivery signals in the seeded quote set. Review flagged commercial exceptions before award.`
        : "No fallback recommendation is available because no priced quote rows were supplied.",
      savingsVsAverage: winner?.totalPriceUsd && average ? Math.max(0, Math.round(average - winner.totalPriceUsd)) : 0
    }
  };
}

function normalizeFallbackRow(vendorName: string, raw: string): NormalizedQuoteRow {
  const lower = raw.toLowerCase();
  const totalPriceUsd = extractTotalUsd(raw);
  const quantity = extractQuantity(raw);
  const unitPriceUsd = totalPriceUsd && quantity ? Math.round(totalPriceUsd / quantity) : null;
  const leadTimeWeeks = extractLeadTimeWeeks(raw);
  const warranty = extractWarranty(raw);
  const paymentTerms = extractPaymentTerms(raw);
  const certifications = [
    lower.includes("api 610") || lower.includes("api-610") ? "API 610" : null,
    lower.includes("316") ? "316 stainless wetted parts" : null,
    lower.includes("ul508a") ? "UL508A" : null
  ].filter((value): value is string => Boolean(value));
  const flags = [
    lower.includes("freight not included") || lower.includes("fob origin") || lower.includes("exw") ? "freight excluded" : null,
    lower.includes("partial") || lower.includes("not bidding the full") ? "partial bid" : null,
    lower.includes("design intent") || lower.includes("subject to engineering review") ? "compliance ambiguity" : null,
    leadTimeWeeks && leadTimeWeeks > 6 ? "lead time exceeds deadline" : null,
    lower.includes("40% with order") ? "nonstandard payment terms" : null
  ].filter((value): value is string => Boolean(value));

  return {
    vendorName,
    unitPriceUsd,
    quantity,
    totalPriceUsd,
    leadTimeWeeks,
    warranty,
    certifications,
    paymentTerms,
    complianceCheck: flags.includes("partial bid")
      ? "Non-responsive partial quote"
      : flags.includes("compliance ambiguity")
        ? "Needs technical review"
        : "Compliant based on supplied email",
    flags
  };
}

function extractTotalUsd(raw: string): number | null {
  const eur = raw.match(/EUR\s*([\d.,]+)/i);
  if (eur) return Math.round(parseNumber(eur[1]) * 1.09);

  const explicitTotal = raw.match(/(?:USD|total|Price:|Base controls package - \$?)\s*\$?\s*([\d,]+(?:\.\d+)?)/i);
  if (explicitTotal) return Math.round(parseNumber(explicitTotal[1]));

  const dollars = [...raw.matchAll(/\$([\d,]+(?:\.\d+)?)/g)].map((match) => parseNumber(match[1]));
  if (dollars.length === 0) return null;
  return Math.round(Math.max(...dollars));
}

function extractQuantity(raw: string): number | null {
  const qty = raw.match(/qty\s*(\d+)/i);
  if (qty) return Number(qty[1]);
  if (raw.toLowerCase().includes("both pump") || raw.toLowerCase().includes("qty 2")) return 2;
  return null;
}

function extractLeadTimeWeeks(raw: string): number | null {
  const days = raw.match(/(\d+)\s*(?:calendar\s*)?days?/i) ?? raw.match(/(\d+)\s*working days?/i) ?? raw.match(/(\d+)\s*business days?/i);
  if (days) return roundWeeks(Number(days[1]) / 7);

  const weekRange = raw.match(/(\d+)\s*-\s*(\d+)\s*wks?/i);
  if (weekRange) return Number(weekRange[2]);

  const weeks = raw.match(/(\d+)\s*weeks?/i);
  if (weeks) return Number(weeks[1]);

  return null;
}

function extractWarranty(raw: string): string | null {
  const warrantyLine = raw.match(/warranty\s*(?:=|:|-)?\s*([^\n.]+)/i);
  return warrantyLine ? warrantyLine[1].trim() : null;
}

function extractPaymentTerms(raw: string): string | null {
  const terms = raw.match(/(?:terms|payment|pay terms)\s*(?::|-)?\s*([^\n.]+)/i);
  return terms ? terms[1].trim() : null;
}

function parseNumber(value: string) {
  return Number(value.replaceAll(",", "").replace(/(\d+)\.(\d{3})$/, "$1$2"));
}

function roundWeeks(value: number) {
  return Math.round(value * 10) / 10;
}

function scoreFallbackRow(row: NormalizedQuoteRow & { totalPriceUsd: number }) {
  const leadPenalty = (row.leadTimeWeeks ?? 8) * 1500;
  const flagPenalty = row.flags.length * 9000;
  return row.totalPriceUsd + leadPenalty + flagPenalty;
}
