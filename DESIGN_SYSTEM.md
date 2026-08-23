# Tattava — Design System

Premium institutional aesthetic: Bloomberg-grade information density,
Linear-grade interaction polish, Notion-grade organization. Dark mode is
the primary, most-polished experience; light mode is fully supported.

## 1. Principles

- Information density over whitespace theatrics — a banker scans, doesn't
  scroll through decoration.
- Typography carries hierarchy; color is used sparingly and with meaning
  (risk/status semantics), not decoration.
- Borders, not shadows, separate regions. Shadows are reserved for
  overlays (dialogs, popovers, dropdowns).
- Numbers are tabular and right-aligned in tables; monospace/tabular-nums
  for anything that represents money, percentages, or dates in a column.
- Motion is a cue, not a performance: 120–200ms, ease-out, used for state
  transitions (feed item arriving, panel open) — never on every hover.

## 2. Color tokens

Defined as CSS custom properties in `src/app/globals.css`, consumed via
Tailwind's `@theme` mapping (`bg-background`, `text-foreground`, etc.).

| Token | Dark (default) | Light |
|---|---|---|
| `--background` | `#0a0b0d` | `#f7f7f5` |
| `--surface` | `#111318` | `#ffffff` |
| `--surface-raised` | `#161920` | `#ffffff` |
| `--border` | `#22262f` | `#e4e4e0` |
| `--border-subtle` | `#1a1d24` | `#ececea` |
| `--foreground` | `#e8e9eb` | `#16181c` |
| `--muted-foreground` | `#8b8f99` | `#6b6f76` |
| `--accent` (Tattava indigo) | `#5b6cff` | `#4148d9` |
| `--accent-foreground` | `#ffffff` | `#ffffff` |
| `--positive` | `#3ecf8e` | `#0e9f6e` |
| `--warning` | `#e8a53d` | `#b5750b` |
| `--negative` | `#ef5b5b` | `#d13c3c` |
| `--gold` (deal-value emphasis) | `#d4af6a` | `#a5792a` |

Semantic mapping — never hardcode raw hex in components:
- Risk `ON_TRACK` → positive, `WATCH` → warning, `AT_RISK` → negative.
- Confidence badges: ≥90% positive, 70–89% warning, <70% muted/outline.
- Priority: `CRITICAL`/`HIGH` → negative/warning accents on a neutral
  badge; `LOW`/`MEDIUM` → muted.

## 3. Typography

- UI font: `Inter` (via `next/font/google`, self-hosted at build time — no
  runtime Google Fonts request), fallback `system-ui`.
- Numeric/financial figures: `font-variant-numeric: tabular-nums` utility
  class `.tabular-nums` applied to all table money/percent/date cells.
- Scale: `text-xs` (11px, labels/eyebrows, uppercase, tracking-wide),
  `text-sm` (13px, body/table default), `text-base` (15px, page body),
  `text-lg`/`text-xl` (section headers), `text-2xl`/`text-3xl` (stat tile
  values, page titles). Investment-banking tables run smaller and denser
  than a typical consumer SaaS.

## 4. Layout

- App shell: fixed left sidebar (240px expanded / 64px collapsed) +
  topbar (56px, search + org switcher + notifications + user menu) + main
  content area with a max content width on very wide screens for
  readability of prose (not tables — tables use full width).
- Content padding: `px-8 py-6` on desktop; density controlled by table row
  height (36–40px) rather than empty page margins.
- Cards: 1px `border-border`, `rounded-md` (6px — not the bubbly
  `rounded-2xl` consumer look), no drop shadow at rest.

## 5. Components (shadcn/ui primitives + Tattava wrappers)

Base: Button, Card, Badge, Table, Tabs, Dialog, DropdownMenu, Avatar,
Progress, Tooltip, Select, Popover, Separator, ScrollArea, Checkbox, Label.

Tattava-specific compositions on top:
- `StatTile` — label, value, delta, trend sparkline.
- `ConfidenceBadge` — percent + semantic color band per §2.
- `EvidenceCitation` — sender/timestamp/quoted-excerpt popover trigger.
- `StageProgress` — horizontal stepper reflecting a deal's service-specific
  workflow, current stage highlighted, past stages checked.
- `IntelligenceFeedItem` — category tag, headline, delta (before → after),
  confidence badge, evidence link, timestamp.
- `RiskPill`, `PriorityPill` — small semantic status badges for tables.
- `DataTable` — sortable/filterable table wrapper (column visibility,
  pagination) shared by Deals/Clients/Tasks.

## 6. Dark/light mode

`next-themes`, `class` strategy, default `dark`. Toggle lives in the
topbar user menu. All tokens above are defined for both; no component may
reference a raw color — only the CSS variables/Tailwind theme tokens.

## 7. Iconography

`lucide-react` exclusively, `size=16` inside dense UI (table rows, sidebar
nav), `size=18–20` in stat tiles/headers. No filled/cartoon icon sets.

## 8. What to avoid

Gradients as decoration, big rounded consumer cards, colorful illustration
art, emoji as UI iconography, low-density "hero" sections, and any
component that could not plausibly ship inside a Bloomberg Terminal or a
Bank's internal deal-management tool.
