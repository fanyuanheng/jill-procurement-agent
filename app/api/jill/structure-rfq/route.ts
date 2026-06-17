import { NextResponse } from "next/server";
import { callLlmJson } from "../../../../lib/services/llm";
import { fallbackStructuredRfq, type StructuredRfqResult } from "../../../../lib/services/jill-fallbacks";
import { buildStructureRfqPrompt, STRUCTURE_RFQ_SYSTEM_PROMPT } from "../../../../lib/services/jill-prompts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { freeFormText?: unknown };
    if (typeof body.freeFormText !== "string" || !body.freeFormText.trim()) {
      return NextResponse.json({ error: "freeFormText is required" }, { status: 400 });
    }

    const prompt = buildStructureRfqPrompt(body.freeFormText);
    const result = await callLlmJson<StructuredRfqResult>({
      system: STRUCTURE_RFQ_SYSTEM_PROMPT,
      prompt,
      maxTokens: 1200
    });

    if (result.ok && isStructuredRfqResult(result.data)) {
      return NextResponse.json({ mode: "live", provider: result.provider, data: result.data });
    }

    return NextResponse.json({
      mode: "fallback",
      provider: result.provider,
      fallbackReason: result.ok ? "Structured RFQ response failed schema validation" : result.error,
      data: fallbackStructuredRfq(body.freeFormText)
    });
  } catch (error) {
    return NextResponse.json({
      mode: "fallback",
      fallbackReason: error instanceof Error ? error.message : "Unexpected structure-rfq error",
      data: fallbackStructuredRfq()
    });
  }
}

function isStructuredRfqResult(value: StructuredRfqResult): value is StructuredRfqResult {
  return Boolean(
    value &&
      typeof value.title === "string" &&
      typeof value.category === "string" &&
      Array.isArray(value.technicalSpecs) &&
      Array.isArray(value.complianceNotes) &&
      Array.isArray(value.fieldsNeedingBuyerConfirmation)
  );
}
