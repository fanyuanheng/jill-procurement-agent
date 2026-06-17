import { NextResponse } from "next/server";
import { callLlmJson } from "../../../../lib/services/llm";
import { fallbackNormalizeQuotes, type NormalizeQuotesResult, type QuoteNormalizeInput } from "../../../../lib/services/jill-fallbacks";
import { buildNormalizeQuotesPrompt, NORMALIZE_QUOTES_SYSTEM_PROMPT } from "../../../../lib/services/jill-prompts";

export async function POST(request: Request) {
  let input: QuoteNormalizeInput | undefined;

  try {
    input = (await request.json()) as QuoteNormalizeInput;
    if (!input.rfq || !Array.isArray(input.quotes)) {
      return NextResponse.json({ error: "rfq and quotes[] are required" }, { status: 400 });
    }
    if (input.quotes.length === 0) {
      return NextResponse.json({ error: "At least one quote email is required for normalization." }, { status: 400 });
    }

    const prompt = buildNormalizeQuotesPrompt(input);
    const result = await callLlmJson<NormalizeQuotesResult>({
      system: NORMALIZE_QUOTES_SYSTEM_PROMPT,
      prompt,
      maxTokens: 1800
    });

    if (result.ok && isNormalizeQuotesResult(result.data)) {
      return NextResponse.json({ mode: "live", provider: result.provider, data: result.data });
    }

    return NextResponse.json({
      mode: "fallback",
      provider: result.provider,
      fallbackReason: result.ok ? "Quote normalization response failed schema validation" : result.error,
      data: fallbackNormalizeQuotes(input)
    });
  } catch (error) {
    return NextResponse.json({
      mode: "fallback",
      fallbackReason: error instanceof Error ? error.message : "Unexpected normalize-quotes error",
      data: fallbackNormalizeQuotes(input)
    });
  }
}

function isNormalizeQuotesResult(value: NormalizeQuotesResult): value is NormalizeQuotesResult {
  return Boolean(
    value &&
      Array.isArray(value.quotes) &&
      value.quotes.length > 0 &&
      value.quotes.every((quote) => typeof quote.vendorName === "string") &&
      value.recommendation &&
      typeof value.recommendation.vendorName === "string" &&
      typeof value.recommendation.rationale === "string" &&
      typeof value.recommendation.savingsVsAverage === "number"
  );
}
