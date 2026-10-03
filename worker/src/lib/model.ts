import type { Env } from "./types";

export interface ModelResponse {
  answer: string;
  passages: string[];
  responseDigest: string;
}

const SYSTEM_PROMPT = `You are a helpful assistant answering questions using only the provided source passages.
Cite each passage you use with [Passage N]. If the passages do not contain the answer, say so clearly.
Do not invent information not present in the passages.`;

export async function callModel(
  question: string,
  passages: string[],
  env: Env,
): Promise<ModelResponse> {
  const apiBase = env.MODEL_API_BASE || "https://api.openai.com/v1";
  const model = env.MODEL_NAME || "gpt-4o-mini";

  const passageText = passages
    .map((p, i) => `[Passage ${i + 1}]\n${p}`)
    .join("\n\n");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: `Source passages:\n\n${passageText}\n\nQuestion: ${question}`,
    },
  ];

  const res = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.MODEL_API_KEY}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.2 }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Model API error ${res.status}: ${body}`);
  }

  const data = await res.json<{
    choices: Array<{ message: { content: string } }>;
  }>();

  const answer = data.choices[0]?.message.content ?? "";

  // Extract passage references cited in the answer
  const citedIndices = [...answer.matchAll(/\[Passage (\d+)\]/gi)].map((m) =>
    parseInt(m[1], 10) - 1,
  );
  const uniqueIndices = [...new Set(citedIndices)].filter((i) => i >= 0 && i < passages.length);
  const citedPassages = uniqueIndices.map((i) => passages[i]);

  const digest = await sha256(answer);

  return { answer, passages: citedPassages, responseDigest: digest };
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
