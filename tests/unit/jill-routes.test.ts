import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as normalizeQuotes } from "../../app/api/jill/normalize-quotes/route";
import { POST as structureRfq } from "../../app/api/jill/structure-rfq/route";
import { callLlmJson, extractJsonText, stripJsonFences } from "../../lib/services/llm";
import type { Rfq } from "../../lib/types";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LLM JSON service", () => {
  it("strips markdown fences before parsing JSON", () => {
    expect(stripJsonFences("```json\n{\"ok\":true}\n```")).toBe("{\"ok\":true}");
  });

  it("extracts JSON from Qwen thinking/prose output", () => {
    expect(extractJsonText("The answer is:\n</think>\n\n{\"ok\":true,\"model\":\"qwen\"}\nextra")).toBe("{\"ok\":true,\"model\":\"qwen\"}");
  });

  it("uses the local OpenAI-compatible endpoint and qwen model by default", async () => {
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "```json\n{\"title\":\"Pump RFQ\"}\n```" } }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await callLlmJson<{ title: string }>({
      system: "Return JSON only.",
      prompt: "Build a test RFQ."
    });

    expect(result).toEqual({ ok: true, data: { title: "Pump RFQ" }, provider: "local" });
    expect(fetch).toHaveBeenCalledWith(
      "http://100.121.222.58:8082/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
        body: expect.stringContaining("\"enable_thinking\":false")
      })
    );
  });

  it("uses the local model even if LLM_PROVIDER is set to a stale value", async () => {
    process.env.LLM_PROVIDER = "legacy-provider";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "{\"title\":\"Local RFQ\"}" } }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await callLlmJson<{ title: string }>({
      system: "Return JSON only.",
      prompt: "Build a test RFQ."
    });

    expect(result).toEqual({ ok: true, data: { title: "Local RFQ" }, provider: "local" });
    expect(fetch).toHaveBeenCalledWith(
      "http://100.121.222.58:8082/v1/chat/completions",
      expect.objectContaining({
        body: expect.stringContaining("qwen3.6:27b-64k")
      })
    );
  });
});

describe("POST /api/jill/structure-rfq", () => {
  it("falls back to seeded structured RFQ data when the default local model call fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("offline", { status: 503 })));

    const response = await structureRfq(new Request("http://localhost/api/jill/structure-rfq", {
      method: "POST",
      body: JSON.stringify({ freeFormText: "Need two API 610 pumps before shutdown. Budget 185k." })
    }));
    const body = await response.json();

    expect(body.mode).toBe("fallback");
    expect(body.provider).toBe("local");
    expect(body.data.title).toContain("pump");
    expect(body.data.technicalSpecs).toEqual(expect.arrayContaining([expect.objectContaining({ label: "Standard" })]));
    expect(body.data.fieldsNeedingBuyerConfirmation.length).toBeGreaterThan(0);
  });

  it("returns live structured RFQ JSON when the local model succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    title: "Emergency pump package",
                    category: "Industrial Equipment",
                    quantity: 2,
                    technicalSpecs: [{ label: "Standard", value: "API 610" }],
                    requiredDeliveryDate: "2026-07-15",
                    budgetCeiling: 185000,
                    complianceNotes: ["API 610 required"],
                    fieldsNeedingBuyerConfirmation: ["Incoterms"]
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const response = await structureRfq(new Request("http://localhost/api/jill/structure-rfq", {
      method: "POST",
      body: JSON.stringify({ freeFormText: "Need two API 610 pumps before shutdown. Budget 185k." })
    }));
    const body = await response.json();

    expect(body.mode).toBe("live");
    expect(body.provider).toBe("local");
    expect(body.data.title).toBe("Emergency pump package");
  });
});

describe("POST /api/jill/normalize-quotes", () => {
  it("returns live normalized quote JSON when the local model succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    quotes: [
                      {
                        vendorName: "Northstar Industrial Supply",
                        unitPriceUsd: 82100,
                        quantity: 2,
                        totalPriceUsd: 164200,
                        leadTimeWeeks: 4,
                        warranty: "24 months",
                        certifications: ["API-610"],
                        paymentTerms: "Net30",
                        complianceCheck: "Compliant",
                        flags: []
                      }
                    ],
                    recommendation: {
                      vendorName: "Northstar Industrial Supply",
                      rationale: "Only vendor quoted; meets API-610 compliance and lead time requirements within budget.",
                      savingsVsAverage: 0
                    }
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const response = await normalizeQuotes(new Request("http://localhost/api/jill/normalize-quotes", {
      method: "POST",
      body: JSON.stringify({
        rfq: testRfq,
        quotes: [
          {
            vendor: "Northstar Industrial Supply",
            rawEmailBody: "Price: USD 164,200 total for qty 2 packages. Lead: 28 calendar days. Terms: Net30. Warranty = 24 months. Compliance: API-610 yes."
          }
        ]
      })
    }));
    const body = await response.json();

    expect(body.mode).toBe("live");
    expect(body.provider).toBe("local");
    expect(body.data.quotes[0]).toEqual(expect.objectContaining({ vendorName: "Northstar Industrial Supply", totalPriceUsd: 164200 }));
  });

  it("falls back to deterministic quote normalization when the local model is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("offline", { status: 503 })));

    const response = await normalizeQuotes(new Request("http://localhost/api/jill/normalize-quotes", {
      method: "POST",
      body: JSON.stringify({
        rfq: testRfq,
        quotes: [
          {
            vendor: "Northstar Industrial Supply",
            rawEmailBody: "Price: USD 164,200 total for qty 2 packages. Lead: 28 calendar days. Terms: Net30. Warranty = 24 months. Compliance: API-610 yes."
          }
        ]
      })
    }));
    const body = await response.json();

    expect(body.mode).toBe("fallback");
    expect(body.provider).toBe("local");
    expect(body.data.quotes).toHaveLength(1);
    expect(body.data.quotes[0]).toEqual(expect.objectContaining({ vendorName: "Northstar Industrial Supply", totalPriceUsd: 164200 }));
    expect(body.data.recommendation.vendorName).toBeTruthy();
    expect(body.data.recommendation.savingsVsAverage).toBeGreaterThanOrEqual(0);
  });

  it("falls back when the model returns malformed quote normalization JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "{\"quotes\":[]}" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );

    const response = await normalizeQuotes(
      new Request("http://localhost/api/jill/normalize-quotes", {
        method: "POST",
        body: JSON.stringify({
          rfq: testRfq,
          quotes: [
            {
              vendor: "Northstar Industrial Supply",
              rawEmailBody: "Price: USD 164,200 total for qty 2 packages. Lead: 28 calendar days."
            }
          ]
        })
      })
    );
    const body = await response.json();

    expect(body.mode).toBe("fallback");
    expect(body.fallbackReason).toContain("schema");
    expect(body.data.recommendation.vendorName).toBeTruthy();
  });
});

const testRfq: Rfq = {
  id: "rfq-test",
  title: "API 610 pump package replacement",
  requester: "Jamie Buyer",
  department: "Operations",
  stage: "Quote Comparison",
  status: "Quotes In",
  category: "Industrial Equipment",
  budget: 185000,
  currency: "USD",
  neededBy: "2026-07-15",
  shipTo: "Basin Field Station 4",
  selectedVendorIds: [],
  createdAt: "2026-06-17T00:00:00.000Z",
  updatedAt: "2026-06-17T00:00:00.000Z",
  lineItems: []
};
