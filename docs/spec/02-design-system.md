# Design System

Depends on: `00-overview.md`, `01-architecture.md`.

Both portals share this system exactly. A component that exists only for one portal
is a red flag; portal difference belongs in navigation and permissions, not in visual
language.

The target is the register of Microsoft Admin Center, Linear, and Atlassian:
information-dense, quiet, fast. Not consumer-marketing. The test for any screen is
whether an administrator can scan it in three seconds and find the one number they
came for.

---

## 1. Principles

1. **Density over decoration.** Whitespace organises; it does not perform. Tables
   show more rows, not bigger padding.
2. **One accent.** Blue carries interactivity and primary action. Colour that does not
   mean something is noise.
3. **Hierarchy through weight and size, not colour.** Slate ink at three weights does
   nearly all of the work.
4. **Motion clarifies causality.** It shows where a thing came from. It is never a
   flourish and never blocks input.
5. **Every state is designed.** Loading, empty, error, permission-denied, and
   partial-data are not afterthoughts — a screen is not done until all five exist.

---

## 2. Colour tokens

Defined as CSS custom properties on `:root` and `[data-theme="dark"]`, exposed to
Tailwind through `tailwind.config.ts`. shadcn/ui's semantic token names are kept so
generated components work unmodified.

### Semantic tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--background` | `#f8fafc` slate-50 | `#020617` slate-950 | Page plane |
| `--card` | `#ffffff` | `#0f172a` slate-900 | Card / table / panel surface |
| `--popover` | `#ffffff` | `#1e293b` slate-800 | Menus, dialogs, tooltips |
| `--foreground` | `#0f172a` | `#f8fafc` | Primary ink |
| `--muted-foreground` | `#64748b` slate-500 | `#94a3b8` slate-400 | Secondary ink, labels |
| `--border` | `#e2e8f0` slate-200 | `#1e293b` slate-800 | Hairlines, dividers, input borders |
| `--input` | `#e2e8f0` | `#334155` slate-700 | Form control borders |
| `--primary` | `#2563eb` blue-600 | `#3b82f6` blue-500 | Primary actions, active nav, links |
| `--primary-foreground` | `#ffffff` | `#ffffff` | Ink on primary |
| `--secondary` | `#f1f5f9` slate-100 | `#1e293b` | Secondary buttons, subtle fills |
| `--accent` | `#eef2ff` indigo-50 | `#312e81` indigo-900 | Hover washes, selected rows |
| `--ring` | `#2563eb` | `#3b82f6` | Focus ring |
| `--destructive` | `#dc2626` red-600 | `#ef4444` red-500 | Destructive actions |

Indigo is a **support** hue: selected states, the sidebar's active indicator, and the
gradient on marketing/auth panels. It never competes with blue for "this is the
button you press."

### Status colours (fixed, never themed, never reused as a series colour)

| Role | Hex | Meaning in this product |
| --- | --- | --- |
| good | `#0ca30c` | Present, passed, placed, active, verified |
| warning | `#fab219` | Pending, awaiting approval, due soon |
| serious | `#ec835a` | Overdue, at-risk attendance, expiring |
| critical | `#d03b3b` | Failed, rejected, suspended, absent |

On the light surface `warning` (1.79:1) and `serious` (2.57:1) fall below 3:1. This is
accepted **on the condition that status is never carried by colour alone** — every
status badge ships an icon and a text label. That pairing is the mitigation, not a
nice-to-have, and a badge rendered as a bare coloured dot is a defect.

### Dark mode

Dark mode is a **selected** set of values, not an inversion. Note that `--card` in dark
mode is *lighter* than `--background`, the opposite of the light-mode relationship —
elevation reads as "closer to the light" in both, which is why a mechanical flip looks
wrong. Theme is applied by a `data-theme` attribute on `<html>`, written by a tiny
blocking script in `<head>` before paint so there is no flash. Preference order:
explicit user choice (persisted) → OS `prefers-color-scheme` → light.

---

## 3. Typography

Single family: `Inter` via `next/font/local` (self-hosted; no external font request —
see the CSP in `10-security.md`), falling back to `system-ui, -apple-system, "Segoe UI", sans-serif`.
No display or serif face anywhere.

| Role | Size / line-height | Weight | Notes |
| --- | --- | --- | --- |
| Page title | 24px / 32px | 600 | One per screen |
| Section heading | 18px / 28px | 600 | |
| Card title | 15px / 24px | 600 | |
| Body | 14px / 20px | 400 | The workhorse — tables, forms, most text |
| Secondary / helper | 13px / 18px | 400 | `--muted-foreground` |
| Label / overline | 12px / 16px | 500 | Uppercase, 0.04em tracking, sparingly |
| Stat value | 30px / 36px | 600 | Dashboard tiles |

**Figures:** proportional by default. `font-variant-numeric: tabular-nums` is applied
to table numeric columns, axis ticks, and anywhere numbers stack vertically — never to
a standalone hero number, where proportional figures are better spaced.

---

## 4. Spacing, radius, elevation

- **Spacing** is Tailwind's 4px scale. Component-internal spacing uses 4/8/12/16;
  between-section spacing uses 24/32.
- **Radius:** `--radius: 8px`. Cards and dialogs 8px, inputs and buttons 6px, badges
  and pills fully rounded, avatars circular. Nothing larger than 12px — oversized
  radii read as consumer, not enterprise.
- **Elevation:** borders do the work, shadows are minimal.
  - Level 0 — flush: `border` only. Cards, tables, panels. **This is the default.**
  - Level 1 — raised: `shadow-sm` + border. Dropdowns, popovers.
  - Level 2 — overlay: `shadow-lg` + border. Dialogs, sheets, command palette.
  - No shadow on a resting card. An enterprise console is flat and bordered.

---

## 5. Motion

Framer Motion, used with restraint. Durations 150ms (micro), 200ms (standard),
300ms (page/panel). Easing `[0.16, 1, 0.3, 1]` for entrances, `easeOut` for exits.

| Element | Motion |
| --- | --- |
| Page transition | Fade + 8px rise, 200ms |
| Dialog / sheet | Scale 0.97→1 + fade, 200ms; sheets slide from edge |
| Dropdown / popover | Fade + 4px rise from trigger, 150ms |
| Stat tile value | Count-up over 600ms, first mount only, never on refetch |
| Chart series | Draw-in 400ms on first paint only; **never re-animate on data update** |
| Table row | No entrance animation. Animating rows makes a table feel slow. |
| Toast | Slide + fade from top-right, 200ms |

`prefers-reduced-motion: reduce` disables all transforms and count-ups, keeping only
opacity fades. This is wired once in a `MotionProvider`, not per component.

---

## 6. Layout

### AppShell

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar 56px  logo · breadcrumb ·· search · theme · bell · me │
├────────────┬─────────────────────────────────────────────────┤
│ Sidebar    │ Content                                          │
│ 260px      │  max-width 1600px, padding 24px                  │
│ (64px      │  ┌────────────────────────────────────────────┐  │
│  collapsed)│  │ PageHeader: title · description · actions   │  │
│            │  ├────────────────────────────────────────────┤  │
│            │  │ Page content                                │  │
│            │  └────────────────────────────────────────────┘  │
└────────────┴─────────────────────────────────────────────────┘
```

- Sidebar: grouped nav with section labels, active item marked by an indigo left rail
  plus `--accent` wash. Collapse state persisted in Redux. Below `lg`, it becomes a
  sheet over the content.
- Topbar: global search (`⌘K` command palette), theme toggle, notification bell with
  unread count fed by Socket.IO, and the user menu.
- Nav definitions live in `client/src/constants/navigation.ts` as data, filtered by the
  user's permissions at render — one definition per portal, no conditional JSX trees.

### Responsive breakpoints

`sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. Below `lg`, sidebar collapses to a
sheet, dashboard grids go single-column, and **tables become card lists** — a
horizontally scrolling enterprise table is unusable on a phone. `DataTable` takes a
`mobileRender` prop for the card representation; if a table does not supply one it
falls back to a horizontally scrollable container inside its own `overflow-x` region,
so the page body itself never scrolls sideways.

---

## 7. Core components

Built on shadcn/ui primitives in `components/ui/` (kept as generated, so upstream
updates apply cleanly). Application composites live in `components/common/` etc.

### DataTable (`components/tables/DataTable.tsx`)

The single most-reused component in the product. TanStack Table v8, headless, wrapping
one consistent shell. Every list screen in both portals uses it — there is no
hand-rolled `<table>` anywhere.

Capabilities, all optional per instance: server-side pagination, sorting, and
filtering (state in the URL); global search with 300ms debounce; column visibility and
density toggles (persisted per-user per-table in Redux); row selection with a bulk
action bar that appears on selection; row click → detail navigation; per-row action
menu; CSV/XLSX export of the current filtered view; sticky header; skeleton loading;
designed empty and error states; the `mobileRender` card fallback.

Contract sketch:

```ts
interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  totalCount: number;
  isLoading: boolean;
  error?: Error | null;
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  filters?: FilterDefinition[];
  bulkActions?: BulkAction<TData>[];
  emptyState: { title: string; description: string; action?: ReactNode };
  mobileRender?: (row: TData) => ReactNode;
}
```

### Other composites

| Component | Purpose |
| --- | --- |
| `PageHeader` | Title, description, breadcrumb, action slot. Every page starts with one. |
| `StatTile` | Label, value, delta with direction, optional sparkline. Dashboard rows. |
| `StatusBadge` | Icon + label + status colour. The only way status is rendered. |
| `EmptyState` | Icon, title, description, primary action. Never a bare "No data". |
| `ErrorState` | Message, request id, retry. Shown on query failure. |
| `ConfirmDialog` | Destructive confirmation; requires typing the entity name for hard deletes. |
| `FormField` | Label, control, description, error, required marker. Wraps RHF `Controller`. |
| `FileDropzone` | react-dropzone + progress + type/size validation + preview. |
| `DateRangePicker` | Preset rows (today, 7/30/90 days, MTD) + custom range behind a divider. |
| `PermissionGate` | Renders children only if the user holds a permission. Never the only check. |
| `Timeline` | Vertical event list — audit logs, application history, interview stages. |

### Forms

React Hook Form + `zodResolver`, with the schema imported from the `shared` workspace
so client and server validate identically. Conventions: labels above controls; a
single column at ≤2 fields, two columns above that on `md+`; validation on blur and on
submit, never on every keystroke; the submit button disables while pending and shows a
spinner; server field errors map back onto the matching form fields via `setError`;
a dirty form warns before navigation.

---

## 8. Charts

Recharts only (Chart.js is dropped — `00-overview.md` §6). All chart components live in
`components/charts/` and wrap Recharts so no screen imports Recharts directly. That
wrapper layer is what guarantees consistent tokens, tooltips, and empty states.

### 8.1 Choosing the form

Pick the form from the data's job before touching colour:

| Job | Form |
| --- | --- |
| One headline number | `StatTile` — **not a chart** |
| Magnitude across categories | Horizontal bar, sorted by value |
| Change over time | Line (multi-series) or area (single series, cumulative) |
| Part-to-whole over time | Stacked bar/area — max 4 segments |
| Part-to-whole, one moment | Stacked bar or a table. **Never a pie beyond 3 slices; never a donut used as decoration.** |
| Two measures, related | Scatter |
| Distribution across two dimensions | Heatmap (attendance calendar) |
| Progress toward a target | Meter/progress bar, not a gauge |

**One y-axis, always.** Dual-axis charts are prohibited. Two measures of different
scale become two charts, small multiples, or values indexed to a common base. This is
the most common serious charting error and there is no exception for it in this product.

### 8.2 Categorical palette — validated

Series colours are assigned **in fixed slot order by entity**, never cycled and never
reassigned by rank. Filtering a chart down to fewer series must not repaint the
survivors: department "CSE" is slot 1 in every chart it appears in, on every screen.

| Slot | Hue | Light | Dark |
| --- | --- | --- | --- |
| 1 | blue | `#2a78d6` | `#3987e5` |
| 2 | orange | `#eb6834` | `#d95926` |
| 3 | aqua | `#1baf7a` | `#199e70` |
| 4 | yellow | `#eda100` | `#c98500` |
| 5 | magenta | `#e87ba4` | `#d55181` |
| 6 | green | `#008300` | `#008300` |
| 7 | violet | `#4a3aa7` | `#9085e9` |
| 8 | red | `#e34948` | `#e66767` |

Validated with the dataviz validator against **this product's own surfaces**
(light `#ffffff`, dark `#0f172a`) — not inherited defaults:

- Light, adjacent pairs: lightness band PASS, chroma PASS, worst adjacent CVD ΔE 9.1
  (yellow↔aqua, protan), worst normal-vision ΔE 19.6. **Contrast WARN:** aqua (2.82),
  yellow (2.17) and magenta (2.69) sit below 3:1 on white.
- Dark, adjacent pairs: all five checks PASS, worst adjacent CVD ΔE 8.4, worst
  normal-vision ΔE 19.3, all slots ≥ 3:1 on slate-900.

**The light-mode contrast WARN is binding, not advisory.** Any chart using slots 3, 4,
or 5 in light mode must ship relief: visible direct labels on those series, or the
table view toggle (§8.6). A chart that leans on those three fills alone to convey
values is not shippable.

**Series cap for all-pairs forms.** Scatter, bubble, and small-multiple charts compare
every series against every other, not just neighbours. Only the **first three slots**
clear the all-pairs gates on our surfaces (light: CVD ΔE 9.2, normal 24.0; dark: CVD
ΔE 9.4, normal 20.9). Past three series in those forms, fold the tail into "Other" or
facet into small multiples. Adjacent-comparison forms (bars, stacks, lines) may use all
eight. A ninth series is never a generated hue — it is "Other", always.

Re-run the validator if any hue changes:

```
node scripts/validate_palette.js "<hex,…>" --mode light --surface "#ffffff"
node scripts/validate_palette.js "<hex,…>" --mode dark  --surface "#0f172a"
```

### 8.3 Sequential and diverging

**Sequential** (attendance heatmap, placement density): single blue hue, light→dark,
steps `#cde2fb #b7d3f6 #9ec5f4 #86b6ef #6da7ec #5598e7 #3987e5 #2a78d6 #256abf #1c5cab #184f95 #104281 #0d366b`.
For *ordinal* ramps (discrete ordered marks — funnel stages, grade tiers) the step
nearest the surface must still clear 2:1: start no lighter than `#86b6ef` in light, go
no darker than `#184f95` in dark.

**Diverging** (attendance vs target, placement vs previous year): blue ↔ red with a
neutral gray midpoint (`#f0efec` light, `#383835` dark), equal steps per arm. Never a
hue at the midpoint — the middle must read as "no difference".

Never a rainbow ramp anywhere in this product.

### 8.4 Mark specs

- Bars: thin, 4px rounded on the data end only, square at the baseline. 2px surface-
  coloured gap between adjacent bars and between stacked segments.
- Lines: 2px stroke, no shadow, monotone interpolation. Markers ≥ 8px, and only on
  charts with fewer than ~30 points.
- Overlapping marks (scatter, overlapping areas) carry a 2px surface-coloured ring so
  they separate without a border colour.
- Grid: horizontal hairlines only (`#e1e0d9` / `#2c2c2a`), no vertical grid, no axis
  domain line except the baseline. Axis labels in muted ink at 12px.
- Labels: selective direct labels — first, last, extremes, or the highlighted series.
  **Never a number on every point.**
- Y-axis starts at zero for bars, always. Line charts may use a fitted domain when
  showing change, and must label the axis so the truncation is visible.

### 8.5 Interaction (default, not optional)

Every chart ships hover: crosshair plus a shared tooltip on line/area, per-mark tooltip
on bar/scatter/heatmap. Tooltips use `--popover`, a hairline border, `shadow-lg`, 12px
text, tabular figures, series swatch beside each row, and show the full unabbreviated
value. Hit targets are larger than the mark. Filters sit in one row above the chart,
never inside it. A bare `StatTile` with no plot is the only form that skips hover.

### 8.6 Accessibility

- ≥ 2 series: a legend is always present, and ≤ 4 series are also direct-labelled.
  A single series needs no legend — the chart title names it.
- Every chart has a **table view toggle** rendering the same data as an accessible
  `<table>`. This is also the relief mechanism for the light-mode contrast WARN and the
  answer for screen-reader users.
- A texture fill (45°/135° line hatching) is available for `forced-colors`, print, and
  the user accessibility setting. Never on by default, never decorative.
- Identity is never carried by colour alone — legend, direct label, or table.

---

## 9. Iconography

`lucide-react` (shipped with shadcn/ui) as the single icon set. 16px inside buttons,
inputs, and table cells; 20px in navigation; 24px in empty states. `react-icons` is
permitted **only** for third-party brand marks (Google, Microsoft OAuth buttons) —
mixing general-purpose icon sets produces visibly inconsistent stroke weights.

---

## 10. Accessibility baseline

WCAG 2.1 AA is the floor, and it is checked in CI (`jest-axe` on component tests,
Cypress + axe on key flows), not assessed by eye.

- Text contrast ≥ 4.5:1; UI component boundaries ≥ 3:1.
- Visible focus ring on every interactive element — `--ring`, 2px, 2px offset. Focus
  outlines are never removed without an equivalent replacement.
- Full keyboard operability: dialogs trap focus and restore it on close; menus support
  arrow-key navigation; tables are keyboard-navigable; skip-to-content link.
- Semantic landmarks, one `<h1>` per page, correct heading order.
- Form errors are associated via `aria-describedby` and announced in a live region.
- Async results (save, delete, import) announce through a polite live region so toast
  content is not visual-only.
