import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GeminiSummaryProvider } from "./geminiSummaryProvider.js";

function geminiResponse(text: string) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  };
}

const input = {
  title: "Use Postgres",
  context: "We need a relational database for the ordering system.",
  outcome: "Chosen option: Postgres, because it fits our operational experience.",
};

describe("GeminiSummaryProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to the model's :generateContent endpoint with the API key", async () => {
    fetchMock.mockResolvedValue(geminiResponse("A summary."));
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    await provider.generateSummary(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-key"
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
  });

  it("sends a single-part prompt containing title, context, and outcome", async () => {
    fetchMock.mockResolvedValue(geminiResponse("A summary."));
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    await provider.generateSummary(input);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents).toHaveLength(1);
    expect(body.contents[0].parts).toHaveLength(1);
    const prompt: string = body.contents[0].parts[0].text;
    expect(prompt).toContain(input.title);
    expect(prompt).toContain(input.context);
    expect(prompt).toContain(input.outcome);
  });

  it("returns the trimmed text of the first candidate", async () => {
    fetchMock.mockResolvedValue(
      geminiResponse("  We chose Postgres because it fits our experience.\n")
    );
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    const summary = await provider.generateSummary(input);

    expect(summary).toBe("We chose Postgres because it fits our experience.");
  });

  it("keeps only the first sentence when the model returns several", async () => {
    fetchMock.mockResolvedValue(
      geminiResponse("We chose Postgres. It is a relational database. Everyone knows it.")
    );
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    const summary = await provider.generateSummary(input);

    expect(summary).toBe("We chose Postgres.");
  });

  it("strips markdown emphasis and code markers from the summary", async () => {
    fetchMock.mockResolvedValue(
      geminiResponse("**We chose `Postgres`** because it *fits* our experience.")
    );
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    const summary = await provider.generateSummary(input);

    expect(summary).toBe("We chose Postgres because it fits our experience.");
  });

  it("throws with status and body text on a non-OK response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "quota exceeded",
    });
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    await expect(provider.generateSummary(input)).rejects.toThrow(/429.*quota exceeded/);
  });

  it("throws when the response has no candidates", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ candidates: [] }) });
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    await expect(provider.generateSummary(input)).rejects.toThrow();
  });

  it("throws when the candidate shape is missing parts", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: {} }] }),
    });
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    await expect(provider.generateSummary(input)).rejects.toThrow();
  });

  it("throws when the returned text is blank", async () => {
    fetchMock.mockResolvedValue(geminiResponse("   \n  "));
    const provider = new GeminiSummaryProvider("gemini-2.0-flash", "test-key");

    await expect(provider.generateSummary(input)).rejects.toThrow();
  });
});
