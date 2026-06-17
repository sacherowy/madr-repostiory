/**
 * Odtwarza projekcję SQLite z gita. Nic nie ginie — źródłem prawdy jest repo.
 * Liczy embeddingi tylko dla blobów, których nie ma jeszcze w cache.
 */
import { config } from "../config.js";
import { SimpleGitAdapter } from "../infrastructure/git/simpleGitAdapter.js";
import { SqliteEmbeddingStore } from "../infrastructure/persistence/sqlite.js";
import { GeminiEmbeddingProvider } from "../infrastructure/embeddings/gemini.js";
import { parseAdr } from "@adr/core";

async function main() {
  const git = new SimpleGitAdapter(config.repoPath);
  const store = new SqliteEmbeddingStore(config.sqlitePath);
  const embedder = new GeminiEmbeddingProvider(config.gemini.model, config.gemini.apiKey);

  const files = await git.listAdrFiles(".");
  const missing = files.filter((f) => !store.has(f.blobSha));
  console.log(`ADR: ${files.length}, do policzenia: ${missing.length}`);

  for (const f of missing) {
    const adr = parseAdr(await git.read(f.path), f.path, f.blobSha);
    const [vec] = await embedder.embed([`${adr.title}\n\n${adr.body}`]);
    store.set(f.blobSha, vec);
    console.log(`  + ${f.path}`);
  }
  console.log("Reindex zakończony.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
