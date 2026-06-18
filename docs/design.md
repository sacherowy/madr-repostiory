# ADR Manager — System projektowy

Język wizualny narzędzia do zarządzania Architecture Decision Records. Wariant **morski** (teal).

## Zasady

- **Czysto i przejrzyście.** Jasne tło, dużo światła, włosowe linie, minimum ozdób.
- **Morska zieleń niesie markę.** Teal jest chłodny, ale na bieli pozostaje przyjazny.
- **Czerwień = destrukcja.** Czerwień jest zarezerwowana wyłącznie dla akcji nieodwracalnych i błędów. Marka nigdy nie miga jak komunikat systemowy.
- **Monospace dla wszystkiego, co maszynowe.** ID ADR, SHA blobów i klucze statusu zawsze noszą krój monospace — sygnał „to jest dane z gita".

---

## Kolor

### Marka — teal

| Token | Hex | Użycie |
| --- | --- | --- |
| `--teal-50` | `#ECF8F5` | tła powierzchni, hover ghost |
| `--teal-100` | `#CFEDE7` | pierścień fokusu (tło) |
| `--teal-200` | `#A3DCD2` | obramowania akcentów |
| `--teal-300` | `#6AC6B8` | gradienty |
| `--teal-400` | `#2BAB9A` | gradienty |
| `--teal-500` | `#0E9E8E` | **primary** — przyciski, akcenty, marka |
| `--teal-600` | `#0B8277` | hover / pressed |
| `--teal-700` | `#0A6A61` | tekst akcentu, eyebrow |
| `--teal-800` | `#08534C` | — |
| `--teal-900` | `#063C37` | — |

### Neutralne (z ledwie wyczuwalną morską nutą)

| Token | Hex | Użycie |
| --- | --- | --- |
| `--bg` | `#FFFFFF` | tło główne |
| `--surface` | `#F4FAF8` | subtelne panele, pola tła |
| `--ink-900` | `#17211F` | tekst podstawowy |
| `--ink-700` | `#36413E` | tekst mocny |
| `--ink-500` | `#5E6A66` | tekst wtórny |
| `--ink-300` | `#9BA5A1` | tekst wyciszony |
| `--line` | `#E7EDEB` | linie włosowe |
| `--line-strong` | `#D6DFDC` | obramowania pól, kart |

### Statusy ADR (domena)

`accepted` przesunięty w żółtszą, leśną zieleń, żeby nie zlewał się z marką.

| Status | Kolor | Tło | Tekst odznaki |
| --- | --- | --- | --- |
| `proposed` | `#5063CE` | `#ECEEFB` | `#3a40a0` |
| `accepted` | `#3A9D4A` | `#E7F5E9` | `#1d6b2a` |
| `deprecated` | `#C98410` | `#FBEFD9` | `#8a5a09` |
| `superseded` | `#74807B` | `#EDF1EF` | `#535d58` |

### Destrukcja (jedyna czerwień w systemie)

| Token | Hex | Użycie |
| --- | --- | --- |
| `--danger` | `#C81E3A` | przycisk usuwania, stan błędu |
| `--danger-600` | `#A8132C` | hover, tekst błędu |
| `--danger-bg` | `#FBE7EA` | tło ostrzeżeń, pierścień błędu |

### Diff (stonowane, by nie walczyły z marką)

| Token | Hex | Tło |
| --- | --- | --- |
| `--add` | `#2F8F3E` | `#EAF5EA` |
| `--del` | `#B23042` | `#FBEAEC` |

---

## Typografia

| Rola | Krój | Użycie |
| --- | --- | --- |
| Display | **Bricolage Grotesque** (600–800) | nagłówki, hero; charakterny, z umiarem |
| Body / UI | **Hanken Grotesk** (400–700) | tekst interfejsu; neutralny, czytelny |
| Mono | **JetBrains Mono** (400–600) | ID, SHA, diff; cyfry tabularne |

### Skala

| Poziom | Rozmiar | Krój / waga |
| --- | --- | --- |
| Display | `clamp(2.5rem, 6.2vw, 4.3rem)` | Bricolage 700, `-0.02em` |
| H2 | `clamp(1.5rem, 3.4vw, 2rem)` | Bricolage 700 |
| H3 | `1.3rem` | Bricolage 700 |
| Body | `1rem` / 1.55 | Hanken 400 |
| Mono | `0.85rem` | JetBrains 500, `tabular-nums` |

---

## Przestrzeń i kształt

- **Odstępy:** 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 px
- **Zaokrąglenia:** `sm 6px` · `md 10px` · `lg 16px` · `full 999px`
- **Cienie:**
  - `sm` — `0 1px 2px rgba(23,33,31,.06), 0 1px 1px rgba(23,33,31,.04)`
  - `md` — `0 14px 34px -18px rgba(6,60,55,.26), 0 2px 6px rgba(23,33,31,.05)`
  - `glow` (primary) — `0 8px 22px -10px rgba(14,158,142,.5)`

---

## Sygnatura — tokeny monospace

Każdy identyfikator maszynowy renderowany jako chip monospace.

- **ID ADR** — `ADR-0007`; tekst `--teal-700`, tło `--teal-50`, obramowanie `--teal-200`.
- **SHA** — `a1b2c3d`; tekst `--ink-500`, tło `--surface`.
- **Klucz statusu** — `accepted`; neutralny chip.

---

## Relacje

Chip monospace z kolorowym znacznikiem (kreska przed etykietą):

| Typ | Znacznik |
| --- | --- |
| `supersedes` / `superseded-by` | `--teal-500` (lita) |
| `depends-on` | `--proposed` / indygo (lita) |
| `relates-to` | `--superseded` / slate (przerywana) |
| `conflicts-with` | `--danger` (lita) |

---

## Komponenty

- **Przyciski** — `primary` (lity teal + glow), `secondary` (kontur), `ghost` (tekst teal), `danger` (kontur karmazynowy, wypełnienie na hover; tylko akcje nieodwracalne).
- **Pola** — etykieta, input, tekst pomocniczy. Fokus: obramowanie `--teal-500` + pierścień `--teal-100`. Błąd: obramowanie `--danger` + pierścień `--danger-bg`.
- **Odznaki statusu** — kropka + etykieta po polsku, kolory wg tabeli statusów.
- **Karta ADR** — pasek akcentu u góry, chip ID + odznaka statusu, tytuł, meta (data, decydenci), chipy relacji, stopka z SHA i miarą podobieństwa.
- **Diff** — numery linii w `--surface`, linie `add`/`del` na stonowanych tłach.
- **Miara podobieństwa** — pasek z gradientem teal + wartość monospace (np. `0.86`).

---

## Głos interfejsu

- Tryb oznajmujący, nazwy z perspektywy użytkownika. „Zapisz zmiany", nie „Submit".
- Akcja brzmi tak samo przez cały przepływ: „Opublikuj" → toast „Opublikowano".
- Błąd nie przeprasza — mówi, co zaszło i jak to naprawić: „Plik zmienił się od ostatniego odczytu. Odśwież i zapisz ponownie."
- Pusty ekran to zaproszenie do działania, nie nastrój.

---

## Tokeny gotowe do wpięcia (`apps/web`)

```html
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

```css
:root{
  /* marka — teal */
  --teal-50:#ECF8F5;  --teal-100:#CFEDE7; --teal-200:#A3DCD2; --teal-300:#6AC6B8;
  --teal-400:#2BAB9A; --teal-500:#0E9E8E; --teal-600:#0B8277; --teal-700:#0A6A61;
  --teal-800:#08534C; --teal-900:#063C37;

  /* neutralne */
  --ink-900:#17211F; --ink-700:#36413E; --ink-500:#5E6A66; --ink-300:#9BA5A1;
  --line:#E7EDEB; --line-strong:#D6DFDC; --surface:#F4FAF8; --bg:#FFFFFF;

  /* statusy ADR */
  --accepted:#3A9D4A;   --accepted-bg:#E7F5E9;
  --proposed:#5063CE;   --proposed-bg:#ECEEFB;
  --deprecated:#C98410; --deprecated-bg:#FBEFD9;
  --superseded:#74807B; --superseded-bg:#EDF1EF;

  /* destrukcja */
  --danger:#C81E3A; --danger-600:#A8132C; --danger-bg:#FBE7EA;

  /* diff */
  --add:#2F8F3E; --add-bg:#EAF5EA; --del:#B23042; --del-bg:#FBEAEC;

  /* typografia */
  --font-display:"Bricolage Grotesque",system-ui,sans-serif;
  --font-body:"Hanken Grotesk",system-ui,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,monospace;

  /* kształt */
  --r-sm:6px; --r-md:10px; --r-lg:16px; --r-full:999px;
  --sh-sm:0 1px 2px rgba(23,33,31,.06),0 1px 1px rgba(23,33,31,.04);
  --sh-md:0 14px 34px -18px rgba(6,60,55,.26),0 2px 6px rgba(23,33,31,.05);
  --glow:0 8px 22px -10px rgba(14,158,142,.5);
}
```

---

## Dostępność (próg jakości)

Widoczny fokus klawiatury, responsywność do mobile, uszanowany `prefers-reduced-motion`, kontrast tekstu zgodny z WCAG AA.
