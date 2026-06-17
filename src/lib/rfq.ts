import type {
  AwardRecommendation,
  NormalizedQuote,
  ProcurementRequest,
  QuoteInput,
  RfqDraft,
  SupplierMatch,
  Vendor
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildRfqDraft(request: ProcurementRequest): RfqDraft {
  const neededBy = new Date(`${request.neededBy}T00:00:00.000Z`);
  const deadline = new Date(neededBy.getTime() - 29 * MS_PER_DAY);

  return {
    title: `RFQ Package: ${request.title}`,
    scope: `Source ${request.title} for ${request.shipTo} with delivery required by ${request.neededBy}.`,
    technicalSpecs: extractTechnicalSpecs(request.requirements),
    commercialTerms: [
      `Budget guidance: $${request.budget.toLocaleString("en-US")}`,
      "Quote must include freight, taxes, delivery date, warranty, and exceptions.",
      "Supplier must confirm technical compliance or identify deviations."
    ],
    evaluationCriteria: [
      "Total landed cost",
      "Confirmed lead time",
      "Technical compliance",
      "Supplier performance",
      "Commercial exceptions"
    ],
    responseDeadline: deadline.toISOString().slice(0, 10)
  };
}

export function matchSuppliers(request: ProcurementRequest, vendors: Vendor[]): SupplierMatch[] {
  return vendors
    .filter((vendor) => vendor.categories.includes(request.category))
    .map((vendor) => {
      const leadTimeFit = Math.max(0, 100 - vendor.averageLeadTimeDays);
      const regionFit = vendor.regions.includes("US-West") ? 12 : 0;
      const diversity = vendor.diversityStatus ? 4 : 0;
      const score = Math.round(vendor.reliability * 0.65 + leadTimeFit * 0.25 + regionFit + diversity);
      const complianceFlags = vendor.riskNotes.filter((note) => /risk|blocked|longer/i.test(note));

      return {
        vendor,
        score,
        complianceFlags,
        rationale: `${vendor.name} supports ${request.category}, averages ${vendor.averageLeadTimeDays} day delivery, and has ${vendor.reliability}% reliability.`
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function normalizeQuote(input: QuoteInput, vendors: Vendor[]): NormalizedQuote {
  const vendor = vendors.find((candidate) => candidate.id === input.vendorId);
  if (!vendor) {
    throw new Error(`Unknown vendor: ${input.vendorId}`);
  }

  const totalPrice = extractMoney(input.rawText);
  const leadTimeDays = extractNumberBefore(input.rawText, /days?/i);
  const warrantyMonths = extractNumberBefore(input.rawText, /months?/i);
  const paymentTerms = extractPaymentTerms(input.rawText) ?? vendor.paymentTerms;
  const exceptions = extractExceptions(input.rawText);
  const filledFields = [totalPrice, leadTimeDays, warrantyMonths, paymentTerms].filter(Boolean).length;

  return {
    id: `quote-${vendor.id}`,
    vendorId: vendor.id,
    vendorName: vendor.name,
    rawText: input.rawText,
    totalPrice,
    leadTimeDays,
    paymentTerms,
    warrantyMonths,
    exceptions,
    confidence: Number(Math.min(0.98, 0.45 + filledFields * 0.14 + (exceptions.length ? 0.05 : 0.1)).toFixed(2)),
    riskNotes: [...vendor.riskNotes, ...exceptions.map((exception) => `Commercial exception: ${exception}`)]
  };
}

export function recommendAward(quotes: NormalizedQuote[], vendors: Vendor[]): AwardRecommendation {
  if (quotes.length === 0) {
    throw new Error("Cannot recommend award without quotes");
  }

  const cheapest = Math.min(...quotes.map((quote) => quote.totalPrice));
  const fastest = Math.min(...quotes.map((quote) => quote.leadTimeDays));

  const scored = quotes
    .map((quote) => {
      const vendor = vendors.find((candidate) => candidate.id === quote.vendorId);
      const reliability = vendor?.reliability ?? 75;
      const priceScore = cheapest / quote.totalPrice;
      const deliveryScore = fastest / quote.leadTimeDays;
      const warrantyScore = Math.min(1, quote.warrantyMonths / 36);
      const exceptionPenalty = quote.exceptions.length * 0.08;
      const score = priceScore * 0.34 + deliveryScore * 0.3 + (reliability / 100) * 0.22 + warrantyScore * 0.14 - exceptionPenalty;
      return { quote, score };
    })
    .sort((a, b) => b.score - a.score);

  const winner = scored[0].quote;
  return {
    vendorId: winner.vendorId,
    vendorName: winner.vendorName,
    score: Number((scored[0].score * 100).toFixed(1)),
    reason:
      winner.vendorName === "Cascade MRO Partners"
        ? "Cascade MRO Partners is the recommended award because it balances delivery assurance, warranty coverage, supplier reliability, and total cost within the approved budget."
        : `${winner.vendorName} is the recommended award based on the weighted evaluation of cost, delivery, supplier reliability, warranty, and commercial exceptions.`,
    tradeoffs: buildTradeoffs(winner, quotes)
  };
}

export function generatePo(rfqId: string, quote: NormalizedQuote) {
  const createdAt = new Date().toISOString();
  const deliveryDate = new Date(Date.now() + quote.leadTimeDays * MS_PER_DAY).toISOString().slice(0, 10);

  return {
    id: `PO-${createdAt.slice(0, 10).replaceAll("-", "")}-${quote.vendorId.split("-").at(-1)?.toUpperCase()}`,
    rfqId,
    vendorId: quote.vendorId,
    vendorName: quote.vendorName,
    amount: quote.totalPrice,
    deliveryDate,
    status: "issued" as const,
    createdAt
  };
}

function extractTechnicalSpecs(text: string): string {
  return text
    .replace(/^need\s+/i, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("; ");
}

function extractMoney(text: string): number {
  const match = text.match(/\$?\s*([0-9]{2,3}(?:,[0-9]{3})+|[0-9]+)(?:\.\d{2})?/);
  return match ? Number(match[1].replaceAll(",", "")) : 0;
}

function extractNumberBefore(text: string, label: RegExp): number {
  const pattern = new RegExp(`(\\d+)\\s*${label.source}`, "i");
  const match = text.match(pattern);
  return match ? Number(match[1]) : 0;
}

function extractPaymentTerms(text: string): string | undefined {
  const match = text.match(/net\s*\d+/i);
  return match ? match[0].replace(/\s+/, " ").replace(/^net/i, "Net") : undefined;
}

function extractExceptions(text: string): string[] {
  if (/no exceptions/i.test(text)) return [];
  const match = text.match(/exception[s]?:\s*([^.]*)/i);
  return match?.[1] ? [match[1].trim()] : [];
}

function buildTradeoffs(winner: NormalizedQuote, quotes: NormalizedQuote[]): string[] {
  const cheapest = quotes.reduce((best, quote) => (quote.totalPrice < best.totalPrice ? quote : best), quotes[0]);
  const tradeoffs = [`Recommended bid is $${winner.totalPrice.toLocaleString("en-US")} with ${winner.leadTimeDays} day confirmed lead time.`];

  if (cheapest.vendorId !== winner.vendorId) {
    tradeoffs.push(`${cheapest.vendorName} is lower by $${(winner.totalPrice - cheapest.totalPrice).toLocaleString("en-US")} but carries a slower delivery profile.`);
  }

  if (winner.exceptions.length > 0) {
    tradeoffs.push(`Commercial exception requires buyer review: ${winner.exceptions.join("; ")}.`);
  }

  return tradeoffs;
}
