export const DEFAULT_LOCAL_LLM_BASE_URL = "http://100.121.222.58:8082/v1";
export const DEFAULT_LOCAL_LLM_MODEL = "qwen3.6:27b-64k";

export type LlmProvider = "local";

type OpenAiCompatibleResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export type LlmJsonResult<T> =
  | { ok: true; data: T; provider: LlmProvider }
  | { ok: false; error: string; provider: LlmProvider };

export function stripJsonFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function extractJsonText(text: string): string {
  const stripped = stripJsonFences(text);
  const start = stripped.search(/[\[{]/);
  if (start === -1) return stripped;

  const opener = stripped[start];
  const closer = opener === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < stripped.length; index += 1) {
    const char = stripped[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === opener) depth += 1;
    if (char === closer) depth -= 1;
    if (depth === 0) return stripped.slice(start, index + 1);
  }

  return stripped.slice(start);
}

export function getLlmProvider(): LlmProvider {
  return "local";
}

export function getLlmStatus() {
  return {
    provider: getLlmProvider(),
    model: process.env.LLM_MODEL ?? DEFAULT_LOCAL_LLM_MODEL,
    baseUrl: (process.env.LLM_BASE_URL ?? DEFAULT_LOCAL_LLM_BASE_URL).replace(/\/$/, "")
  };
}

export async function callLlmJson<T>({
  system,
  prompt,
  maxTokens = 1800
}: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<LlmJsonResult<T>> {
  return callLocalJson<T>({ system, prompt, maxTokens });
}

async function callLocalJson<T>({
  system,
  prompt,
  maxTokens
}: {
  system: string;
  prompt: string;
  maxTokens: number;
}): Promise<LlmJsonResult<T>> {
  const provider: LlmProvider = "local";
  const baseUrl = (process.env.LLM_BASE_URL ?? DEFAULT_LOCAL_LLM_BASE_URL).replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? DEFAULT_LOCAL_LLM_MODEL;

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        chat_template_kwargs: {
          enable_thinking: false
        },
        messages: [
          {
            role: "system",
            content: `${system}\nReturn only the final JSON object. Do not include thinking, analysis, markdown, or prose.`
          },
          { role: "user", content: prompt }
        ]
      })
    });

    if (!response.ok) {
      return { ok: false, error: `Local LLM request failed with ${response.status}`, provider };
    }

    const payload = (await response.json()) as OpenAiCompatibleResponse;
    const text = payload.choices?.[0]?.message?.content;
    if (!text) {
      return { ok: false, error: "Local LLM response did not include message content", provider };
    }

    return { ok: true, data: JSON.parse(extractJsonText(text)) as T, provider };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Local LLM JSON parsing failed", provider };
  }
}
