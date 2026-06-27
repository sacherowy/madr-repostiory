# ADR Manager

Nakładka na git do zarządzania **Architecture Decision Records**. Decyzje to pliki Markdown wersjonowane przez git; aplikacja dokłada GUI, relacje między ADR-ami, porównania, historię oraz semantyczne wyszukiwanie podobieństw przez model embeddingów.

## Zasada naczelna

> **Git jest jedynym źródłem prawdy. SQLite to wtórna projekcja do indeksowania — zawsze odtwarzalna z repo.**

Nic autorytatywnego nie żyje wyłącznie w bazie. Kasujesz plik SQLite, odpalasz `pnpm reindex` — domena pozostaje nietknięta, bo siedzi w gicie. Treść, status, relacje i grupy ADR-ów są w plikach; wersje, historia i diff pochodzą wprost z gita.

| Co | Gdzie żyje | Charakter |
| --- | --- | --- |
| Treść ADR, status, relacje, tagi | Markdown + frontmatter (git) | źródło prawdy |
| Foldery / grupowanie | katalogi w repo (git) | źródło prawdy |
| Historia, wersje, diff | `git log` / `git diff` | źródło prawdy |
| Cache embeddingów (po SHA blobu) | SQLite | projekcja, odtwarzalna |
| Indeks wyszukiwania | SQLite | projekcja, odtwarzalna |
| Użytkownicy / role / sesje | SQLite lub OIDC | stan operacyjny |

## Funkcje

- GUI do tworzenia i edycji ADR-ów (format MADR).
- Łączenie ADR-ów w relacje (`supersedes`, `superseded-by`, `relates-to`, `depends-on`, `conflicts-with`).
- Wersjonowanie oparte o git — każdy zapis to commit.
- Grupowanie w foldery (realne katalogi repo).
- Podgląd historii zmian (oś czasu z `git log`).
- Porównania: wersja ↔ wersja (diff gita) oraz ADR ↔ ADR (strukturalne porównanie pól).
- Semantyczne wyszukiwanie podobieństw w obrębie gałęzi drzewa folderów (embeddingi Gemini + cache po SHA).
- Cykl życia statusu, tagi, walidacja schematu, wykrywanie `supersedes`, eksport — na roadmapie.

## Stos technologiczny

- **Frontend:** React + Vite + TypeScript (`apps/web`)
- **Backend:** Node.js + Fastify + TypeScript (`apps/api`)
- **Domena:** czysty TypeScript, bez I/O (`packages/core`)
- **Git:** `simple-git` (owijka na CLI)
- **Projekcja:** SQLite (`better-sqlite3`)
- **Embeddingi:** Gemini `text-embedding-004`

## Architektura

Heksagonalna: domena w `packages/core` nie zna gita, modelu ani bazy — sięga przez **porty** (`GitPort`, `EmbeddingProvider`, `EmbeddingStore`, `SearchIndex`). Adaptery żyją w `apps/api/src/infrastructure`. Te same porty są szwem testowym: w testach jednostkowych podstawiasz `FakeEmbeddingProvider` i git generowany w katalogu tymczasowym.

```
adr-manager/
├─ apps/
│  ├─ web/                 # React/Vite — GUI
│  └─ api/                 # Fastify — moduły + adaptery
│     └─ src/
│        ├─ server.ts
│        ├─ config.ts
│        ├─ scripts/reindex.ts
│        └─ infrastructure/
│           ├─ git/         → GitPort (simple-git)
│           ├─ embeddings/  → EmbeddingProvider (gemini | fake)
│           └─ persistence/ → EmbeddingStore (sqlite)
├─ packages/
│  ├─ core/                # czysta domena + porty (zero I/O)
│  └─ shared/              # typy współdzielone web ↔ api
└─ examples/               # przykładowy ADR w formacie MADR
```

Przepływy danych (zapis ADR, podobieństwo w gałęzi, porównania, historia) opisane są w osobnym diagramie przekazanym razem z tym scaffoldem.

## Wymagania

- Node.js ≥ 20
- pnpm ≥ 9
- git w `PATH`

## Szybki start

```bash
pnpm install
cp .env.example .env        # uzupełnij GEMINI_API_KEY i ADR_REPO_PATH

# zainicjuj repozytorium ADR (źródło prawdy), jeśli nie masz
mkdir -p data/adr-repo && git -C data/adr-repo init

pnpm dev                    # web + api równolegle
```

API wystawia na start `GET /health`. Web proxuje `/api` na `http://localhost:3000`.

## Konfiguracja (`.env`)

| Zmienna | Opis |
| --- | --- |
| `ADR_REPO_PATH` | ścieżka do repozytorium ADR (źródło prawdy) |
| `SQLITE_PATH` | plik projekcji SQLite |
| `GEMINI_API_KEY` | klucz do embeddingów Gemini |
| `GEMINI_EMBED_MODEL` | model embeddingów (domyślnie `text-embedding-004`) |
| `OIDC_*` | konfiguracja logowania zespołowego (do uzupełnienia) |
| `PORT` | port API |

## Format ADR (MADR)

Format oparty na [MADR v4.0.0](https://github.com/adr/madr/releases/tag/4.0.0) (wydanie 2024-09-17, commit `2475fe1973f66a12aaf58a91d8fa7b42c0f5ea3d`) — przykład poniżej odpowiada aktualnie zaimplementowanemu formatowi; pełne dostosowanie do szablonu MADR (`decision-makers`/`consulted`/`informed`, status `rejected`, tytuł jako H1 w treści) jest w toku, zobacz `.kiro/specs/madr-template-alignment/`.

```markdown
---
id: "0007"
title: Użycie Kafki jako szyny zdarzeń
status: accepted        # proposed | accepted | deprecated | superseded
date: 2026-06-17
deciders: [pawel, eliza]
tags: [eda, messaging]
relations:
  - type: supersedes    # supersedes | superseded-by | relates-to | depends-on | conflicts-with
    target: "0003"
---

## Kontekst
...
## Decyzja
...
## Konsekwencje
...
```

## Współbieżność

Przy wielu edytujących stosujemy **optymistyczną kontrolę współbieżności**: zapis niesie ostatnio znany SHA blobu, a serwer odrzuca go (409), jeśli plik zmienił się w międzyczasie. Każdy zapis to osobny commit; zapisy serializowane są kolejką per repozytorium.

## Testy

Dwa poziomy, zgodnie z dostępem do sieci:

```bash
pnpm test               # jednostkowe — fake'i, git w tmp, zero sieci
pnpm test:integration   # integracyjne — realny Gemini (wymaga sieci + GEMINI_API_KEY)
```

- **Jednostkowe** używają `FakeEmbeddingProvider` (deterministyczny, bez sieci) oraz repozytorium git tworzonego w locie w katalogu tymczasowym (`git init`, commity, diff). Działają nawet bez dostępu sieciowego.
- **Integracyjne** (`*.integration.test.ts`) odpalają się tylko, gdy ustawiony jest `GEMINI_API_KEY` — w przeciwnym razie są pomijane.

## Reindex (odtworzenie projekcji)

```bash
pnpm reindex
```

Przechodzi po ADR-ach w repo i liczy embeddingi tylko dla blobów, których nie ma w cache (klucz = SHA blobu). Bezpieczne do wielokrotnego uruchamiania.

## Rozwój przez zdalne Claude Code (Claude Code on the web)

Projekt jest przystosowany do pracy w sandboxie chmurowym:

- **Jedno repo główne** = kod aplikacji; uruchamiasz sesję z tego repozytorium.
- **Repo testowe nie jest potrzebne** — fixtures generujemy w locie w testach (`git init` w tmp). To czysto lokalna operacja, niewymagająca sieci.
- **Embeddingi przez Gemini działają na domyślnym poziomie sieci Trusted**, bo host `generativelanguage.googleapis.com` jest objęty regułą `*.googleapis.com`. Klucz `GEMINI_API_KEY` ustawiasz jako zmienną środowiskową środowiska (uwaga: brak dedykowanego magazynu sekretów — zmienne widzi każdy z dostępem do edycji środowiska).
- Dla innych dostawców (OpenAI, OpenRouter, Voyage) trzeba przełączyć sieć na **Custom** i dodać ich domeny.

## Ścieżka skalowania

Gdy korpus urośnie do tysięcy ADR-ów i zechcesz prawdziwego ANN oraz współbieżnych zapisów, projekcję przenosisz z SQLite na **PostgreSQL + pgvector**. Zasada naczelna się nie zmienia — projekcja nadal jest odtwarzalna z gita.

## Licencja

MIT
