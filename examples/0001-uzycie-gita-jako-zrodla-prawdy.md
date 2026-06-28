---
id: "0001"
status: accepted
date: 2026-06-17
decision-makers: [pawel]
tags: [architecture, storage]
relations:
  - type: relates-to
    target: "0002"
---

# Użycie gita jako źródła prawdy dla ADR

## Kontekst
Aplikacja zarządza ADR-ami i potrzebuje wersjonowania, historii oraz porównań.

## Decyzja
Trzymamy ADR-y jako pliki Markdown z frontmatterem YAML w repozytorium git.
Git jest jedynym źródłem prawdy; SQLite pełni rolę wtórnej projekcji do indeksowania
(cache embeddingów, wyszukiwanie), zawsze odtwarzalnej przez `pnpm reindex`.

## Konsekwencje
- Pełna historia i diff za darmo z gita.
- Brak stanu autorytatywnego poza repo → łatwy backup i migracja.
- Współbieżne zapisy wymagają optymistycznej kontroli po SHA blobu.
