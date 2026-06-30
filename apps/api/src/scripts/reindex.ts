/**
 * Odtwarza projekcję SQLite z gita. Nic nie ginie — źródłem prawdy jest repo.
 * Liczy embeddingi tylko dla blobów, których nie ma jeszcze w cache.
 * Indeks wyszukiwania pełnotekstowego jest odtwarzany w całości przy każdym
 * uruchomieniu (treść body nie jest kluczowana po blobSha jak embeddingi),
 * a wpisy ADR-ów, których już nie ma w repozytorium, są z niego usuwane
 * (Req 11.3, 11.4).
 */
import { config } from "../config.js";
import { SimpleGitAdapter } from "../infrastructure/git/simpleGitAdapter.js";
import { SqliteEmbeddingStore } from "../infrastructure/persistence/sqlite.js";
import { SqliteSearchIndex } from "../infrastructure/persistence/sqliteSearchIndex.js";
import { GeminiEmbeddingProvider } from "../infrastructure/embeddings/gemini.js";
import { parseAdr, combinedSectionText } from "@adr/core";

export async function main(cfg: {
  repoPath: string;
  sqlitePath: string;
  gemini: { model: string; apiKey: string };
}): Promise<void> {
  const git = new SimpleGitAdapter(cfg.repoPath);
  const store = new SqliteEmbeddingStore(cfg.sqlitePath);
  const searchIndex = new SqliteSearchIndex(cfg.sqlitePath);
  const embedder = new GeminiEmbeddingProvider(cfg.gemini.model, cfg.gemini.apiKey);

  const files = await git.listAdrFiles(".");
  const adrs = await Promise.all(
    files.map((f) => git.read(f.path).then((raw) => parseAdr(raw, f.path, f.blobSha)))
  );

  const missing = files.filter((f) => !store.has(f.blobSha));
  console.log(`ADR: ${files.length}, do policzenia: ${missing.length}`);

  for (const f of missing) {
    const adr = adrs.find((a) => a.blobSha === f.blobSha)!;
    const combinedText = combinedSectionText(adr, adr.additionalContent);
    const [vec] = await embedder.embed([`${adr.title}\n\n${combinedText}`]);
    store.set(f.blobSha, vec);
    console.log(`  + ${f.path}`);
  }

  for (const adr of adrs) {
    const combinedText = combinedSectionText(adr, adr.additionalContent);
    searchIndex.upsert({ id: adr.id, title: adr.title, body: combinedText, tags: adr.tags ?? [] });
  }

  const currentIds = new Set(adrs.map((adr) => adr.id));
  const staleIds = searchIndex.ids().filter((id) => !currentIds.has(id));
  for (const id of staleIds) {
    searchIndex.remove(id);
  }
  console.log(
    `Indeks wyszukiwania: ${adrs.length} ADR, usunięto ${staleIds.length} nieaktualnych wpisów.`
  );

  console.log("Reindex zakończony.");
}

// Tylko uruchamiamy realny batch job, gdy ten plik jest wykonywany
// bezpośrednio jako punkt wejścia procesu (np. `pnpm reindex`), a nie gdy
// jest jedynie importowany przez plik testowy — ten sam wzorzec co w
// server.ts.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(config).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
