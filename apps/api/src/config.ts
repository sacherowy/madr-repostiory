export const config = {
  repoPath: process.env.ADR_REPO_PATH ?? "./data/adr-repo",
  sqlitePath: process.env.SQLITE_PATH ?? "./data/index.sqlite",
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
    model: process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004",
  },
  port: Number(process.env.PORT ?? 3000),
};
