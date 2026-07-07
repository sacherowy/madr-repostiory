import type { SummaryProvider } from "@adr/core";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export class GeminiSummaryProvider implements SummaryProvider {
  constructor(
    readonly model: string,
    private apiKey: string
  ) {}

  async generateSummary(input: {
    title: string;
    context: string;
    outcome: string;
  }): Promise<string> {
    const prompt = [
      "Summarize the following architecture decision in exactly one plain-language sentence.",
      "Respond with the sentence only: no markdown, no preamble, no quotes.",
      "",
      `Title: ${input.title}`,
      `Context: ${input.context}`,
      `Outcome: ${input.outcome}`,
    ].join("\n");

    const url = `${BASE}/${this.model}:generateContent?key=${this.apiKey}`;
    const body = { contents: [{ parts: [{ text: prompt }] }] };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Gemini summary ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      throw new Error("Gemini summary: response contained no candidate text");
    }
    const sentence = toSingleSentence(text);
    if (sentence === "") {
      throw new Error("Gemini summary: response text was blank");
    }
    return sentence;
  }
}

/** Strip markdown markers, collapse whitespace, and keep only the first sentence. */
function toSingleSentence(text: string): string {
  const plain = text
    .replace(/[*_`]/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  const match = plain.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : plain).trim();
}
