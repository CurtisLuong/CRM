# realty-crm-ui — Sổ Khách v3 UI kit

The Realty CRM design system as real code: **React 18 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui** (Radix, Lucide, Recharts, Sonner, react-day-picker).
Rules for anyone building screens: **[DESIGN.md](DESIGN.md)**.

```bash
npm install
npm run dev          # UI kit page at http://localhost:5173
npm run build        # typecheck + production build
npm run check:colors # fails on raw hex / Tailwind palette colors
```

## What's inside

```
src/
  styles/globals.css     ← ALL tokens: dark (default) + light themes, shadcn variables mapped to them,
                           Tailwind @theme (bg-surface-100, text-alert-text, shadow-glow-alert, text-overline…)
  lib/utils.ts           ← cn() (tailwind-merge that knows the type scale)
  lib/crm/               ← business logic, no UI
    signals.ts           ← Level, signalFor(due), LEVEL_ORDER
    stages.ts            ← STAGES (+ SLA hours), STAGE_MOVES, slaFor(stage, hours), hoursBetween
    actions.tsx          ← the 9 actions + Lucide icons
    notifications.ts     ← notification types → action / CTA / bulk label
    format.ts            ← fmtDur "4n 06h", fmtWhen "T5 22/10 09:39", fmtVND "1,85 tỷ", fmtPhone, fmtPct…
  components/ui/         ← shadcn primitives restyled with tokens (button, input, select, dialog, sheet,
                           table, tooltip, popover, calendar, sonner, skeleton, card, tabs, chart)
  components/crm/        ← CRM components (import from "@/components/crm")
    signal.tsx           ← Glyph, SignalBadge
    stage.tsx            ← StageChip, SlaMeter, StagePath
    timeline.tsx         ← Timeline (stages outer, actions inside)
    actions.tsx          ← ActionIcon, ActionButton (inline / icon / stacked), ActionItem, Avatar
    lead.tsx             ← LeadRow, PipelineCard, StatTile
    form-fields.tsx      ← Field, TextField, SelectField, DatePicker, SearchBar
    data-table.tsx       ← DataTable, Pagination
    empty-state.tsx      ← EmptyState (customers / results / done / error)
    shell.tsx            ← AppShell, Sidebar, PageHeader, NotificationBell
    notifications.tsx    ← NotificationItem, NotificationGroup, NotificationCenter
    charts.tsx           ← ChartCard, MetricCard, BarChart, FunnelChart, StageAgingChart, MatrixTable, InsightList, SampleBadge
    filters.tsx          ← ChipGroup, Segmented, SortControl, FilterSection, FilterChip, SavedViews, FilterBar
  pages/UiKit.tsx        ← living style guide: every component with demo data (also the reference for AI workers)
scripts/check-colors.mjs ← token-only guard (put it in CI / the Factory reviewer)
components.json          ← shadcn config: `npx shadcn add <x>` drops new primitives into components/ui,
                           and they pick up the tokens automatically via the shadcn variables
```

## Bringing it into Sổ Khách (v3 on the `factory` branch)

1. **Scaffold v3 from this kit.** Copy `package.json` deps, `vite.config.ts`, `tsconfig*`, `components.json`, `src/styles`, `src/lib`, `src/components`, `DESIGN.md`, `scripts/`. Keep `pages/UiKit.tsx` reachable at `/ui-kit` (dev only) so workers can look before they build.
2. **Port logic, not markup.** Move Supabase calls, IndexedDB offline sync and business rules from v2 into `src/lib/` (hooks / services). Screens are rebuilt from components; do not copy v2 HTML.
3. **Screen order:** Hôm nay (ActionItem queue + StatTiles + call session) → Khách hàng (DataTable + FilterBar + customer Sheet with Timeline) → Thông báo → Hiệu quả (charts) → forms. Ship each behind the branch preview, compare with v2, then the next.
4. **Data the components expect:**
   - customer: `stage`, `stage_started_at`, `next_action` (`ActionId`), `next_due_at` → `signalFor(next_due_at)`
   - stage history rows: `{ stage, start, end }` (write `end` of the old row = `start` of the new one in one transaction) + activity rows `{ action, at, outcome, level, note, by }` grouped by the stage they fall in → `<Timeline>`
   - SLA settings per team (override `STAGES[].sla`), last-touch time for Chăm dài hạn
5. **Factory rules:** point workers at DESIGN.md; the automated reviewer runs `npm run build` and `npm run check:colors` and rejects new components that duplicate an existing one.

## Theme

Dark ("mission control") is the default: `<html data-theme="dark">`. Light: `data-theme="light"`. Every token is defined for both; nothing else needs to change. The `dark:` / `light:` Tailwind variants follow the same attribute.

## Notes

- Recharts is pinned to 2.15 (what shadcn charts target); upgrade to v3 together with shadcn's chart component.
- Fonts: Be Vietnam Pro (UI) + JetBrains Mono (numbers, timers, overlines) from Google Fonts in `index.html`; self-host them for full offline PWA use.
- Placeholder SLA numbers live in `src/lib/crm/stages.ts` — replace with your real ones.
