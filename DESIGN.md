# Trakwyn Design System

A description of Trakwyn's visual language for anyone — human or AI agent — building UI in this codebase. There is no design-token layer, no theme file, and no CSS-in-JS: every surface is styled with directly-authored [Tailwind CSS v4](https://tailwindcss.com) utility classes on Tailwind's **stock** color/spacing/type scale. This document is the closest thing to tokens Trakwyn has — read it before inventing a new color, spacing value, or component pattern.

The canonical component set lives in `packages/ui` (`Button`, `IconButton`, `Input`, `Select`, `Textarea`, `Checkbox`, `FormLabel`, `Badge`, `Card`, `Modal`, `Alert`, `Skeleton`, `Spinner`, `ProgressBar`, `EmptyState`) and is consumed by `apps/web`. **Reach for one of these before hand-rolling a new button, input, or pill** — a new one-off risks a fourth shade of "primary blue" existing in the app.

## Brand

The mark (`apps/web/src/components/LogoMark.tsx`) is two chevrons at unequal weight — a position and the position it came from — always drawn as inline SVG (`stroke: currentColor`), never a raster logo file, so it follows text color and theme automatically:

- Foreground color: `text-blue-700 dark:text-blue-400` (see [Colors](#colors) — this is the one place the mark's own color changes with theme; everywhere else blue-600/blue-700 is the fixed light-mode accent).
- Solid-tile assets (favicon, app icon, extension icon) are white on a blue tile and have no theme to follow.

No custom brand typeface — see [Typography](#typography).

## Colors

Tailwind's stock palette, used semantically. Every color below needs a `dark:` counterpart wherever it appears — see [Dark mode](#dark-mode).

### Neutral (structure & text)

| Role                        | Light                              | Dark                               |
| --------------------------- | ---------------------------------- | ---------------------------------- |
| Page background             | `bg-gray-50` (`#f9fafb`)           | `dark:bg-gray-900` (`#111827`)     |
| Card / panel background     | `bg-white`                         | `dark:bg-gray-800`                 |
| Sidebar / header background | `bg-white`                         | `dark:bg-gray-800`                 |
| Border, default             | `border-gray-200`                  | `dark:border-gray-700` (or `-800`) |
| Border, form control        | `border-gray-300`                  | `dark:border-gray-600`             |
| Heading text                | `text-gray-900`                    | `dark:text-gray-100`               |
| Body text                   | `text-gray-700`                    | `dark:text-gray-300`               |
| Muted / secondary text      | `text-gray-500` or `text-gray-600` | `dark:text-gray-400`               |
| Placeholder / disabled text | `text-gray-400`                    | (unchanged)                        |

### Accent — blue

The one brand color. `blue-600` is the primary action surface; `blue-700` is its hover and its **text** shade (a solid `blue-600` button needs white text, not more blue-600); `blue-400` is what blue lifts to for **text** in dark mode, because `blue-700` text on a `gray-900` background sits too close to its own background to read.

| Use                             | Classes                                                               |
| ------------------------------- | --------------------------------------------------------------------- |
| Primary button / CTA fill       | `bg-blue-600 hover:bg-blue-700`, white text                           |
| Link / accent text              | `text-blue-600 hover:text-blue-700 dark:text-blue-400`                |
| Active nav item                 | `bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300`     |
| Info callout background         | `bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900` |
| Focus ring (every form control) | `focus:ring-2 focus:ring-blue-500`                                    |

### Semantic status colors

| Meaning             | Color                                      | Typical use                                                                                                             |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Destructive / error | red (`red-600` fill, `text-red-600` alone) | Delete/revoke actions, `Alert tone="error"`, invalid-field border (`border-red-500`)                                    |
| Success             | green                                      | `Alert tone="success"`, confirmation text, a "Recommended" badge                                                        |
| Caution             | amber/yellow                               | Inline warning callouts (`bg-amber-50 border-amber-200`), a "full access" scope badge (`bg-yellow-100 text-yellow-700`) |
| Neutral tag         | gray/slate                                 | Default `Badge` tone, a "read-only" scope badge                                                                         |

`Badge` (`packages/ui/src/Badge.tsx`) is the canonical set of tag/status pill colors — **9 tones**: `gray`, `slate`, `blue`, `purple`, `yellow`, `orange`, `green`, `red`, `emerald`. Don't reach past this list for a new pill color without a real reason.

**Application status has one canonical color map, and only one.** `apps/web/src/features/applications/lib/statusColors.ts` is the single source of truth for every status's `Badge` tone, dot color, and board-column accent — draft (gray), applied (blue), interviewing (purple), offered (orange), accepted (green), rejected (red), withdrawn (slate). Before this map existed, the board and the status badge each carried their own mapping and disagreed on three of seven statuses; the same application changed color depending on which screen you looked at. **Anything that colors a status reads this map** — never hand-pick a color for a status inline. And per that file's own rule: **color is never the only cue** — every surface using these colors also shows the localized status text next to it.

## Typography

No custom typeface — Tailwind's default system-font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`). Don't add a webfont without a real reason; this app has never needed one.

| Class       | Size / line-height | Where it's actually used                                                                                           |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `text-xs`   | 12px               | Badge/pill text, helper text under a field, timestamps                                                             |
| `text-sm`   | 14px               | **The base UI size** — body copy, buttons, inputs, labels, nav items; nothing in `packages/ui` is larger than this |
| `text-base` | 16px               | Marketing-page body paragraphs (often `text-base/7` for looser leading)                                            |
| `text-lg`   | 18px               | Marketing sub-headline copy                                                                                        |
| `text-xl`   | 20px               | A guide/article `h2`                                                                                               |
| `text-2xl`  | 24px               | A settings page's `h1` (e.g. "Settings"), a marketing benefit `h2`                                                 |
| `text-3xl`  | 30px               | A guide/hero `h1`, a CTA-band `h2`                                                                                 |
| `text-4xl`  | 36px               | A `/features/*` hero `h1` at rest                                                                                  |
| `text-5xl`  | 48px               | The same hero `h1` at `sm:` and up — the largest text in the app                                                   |

Weight: `font-normal` for body copy, `font-medium` for labels/nav/buttons, `font-semibold` for section headings and emphasis, `font-bold` for page and hero titles. `tracking-tight` pairs with the largest hero headings; `tracking-wide` + `uppercase` + `text-xs`/`text-[11px]` is the pattern for a small section eyebrow/kicker label (e.g. a table-of-contents group heading).

## Spacing & layout

Tailwind's default spacing scale, no custom steps. Prefer `gap-*` on `flex`/`grid` over margins between siblings — spacing that survives a sibling being added, removed, or reordered without every neighbor's margin needing a rethink.

| Purpose                              | Typical value                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Icon-to-label gap                    | `gap-1.5` to `gap-2`                                                                                                                        |
| Form-field stack                     | `gap-3` (12px)                                                                                                                              |
| Related-content gap (card internals) | `gap-4`                                                                                                                                     |
| Section-to-section gap               | `gap-8` to `gap-10`, or `space-y-10` between major settings-page sections                                                                   |
| Button padding                       | `px-4 py-2` (md), `px-3 py-1.5` (sm)                                                                                                        |
| Input/select/textarea padding        | `px-3 py-2`                                                                                                                                 |
| Badge padding                        | `px-2 py-0.5`                                                                                                                               |
| Card padding                         | No default — call sites use anywhere from `p-3` to `p-6`; a padding-free horizontal list row is also valid. Always pass it via `className`. |
| Page container width                 | `max-w-4xl` (settings), `max-w-6xl` (marketing)                                                                                             |

## Radii & elevation

Three radii, used consistently — don't introduce a fourth without a reason:

| Radius         | Used for                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `rounded-lg`   | Buttons, inputs, select, textarea, alerts, list rows — the default for almost everything interactive |
| `rounded-xl`   | `Card`, the `Modal` panel — anything read as a distinct "surface"                                    |
| `rounded-full` | `Badge` pills, avatars, status dots                                                                  |

Elevation is understated: `shadow-sm` for a resting card, `shadow-lg`/`shadow-xl`/`shadow-2xl` only for overlays (a `Modal`, the mobile sidebar drawer). Nothing at rest on the page carries a heavy shadow.

## Icons

[lucide-react](https://lucide.dev) exclusively — stroke-based, 24px viewBox, `stroke-width: 2`, round caps/joins. **Never emoji, never a filled/glyph icon font.** Sizes in practice: 16px in a dense sub-nav, 18px in the main sidebar, 24px in a page header or hero eyebrow. An icon-only control always carries an accessible name via `IconButton`'s required `label` prop (rendered as both `aria-label` and `title`) — there is no icon-only button anywhere without one.

## Components & states

| Component                       | Variants                                                                                                              | Hover / focus                                                            | Disabled / invalid                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `Button`                        | `primary` (blue fill), `destructive` (red fill), `secondary` (bordered), `ghost` (text-only), `link`; sizes `sm`/`md` | Each variant darkens/underlines on hover (e.g. `hover:bg-blue-700`)      | `disabled:opacity-60` on every variant, no separate disabled color          |
| `IconButton`                    | `default`, `danger` (hover → red), `subtle` (hover gets a bg); sizes `sm`/`md`                                        | Icon color shifts from `text-gray-400` to a darker/danger shade on hover | `disabled:opacity-30 disabled:cursor-not-allowed`                           |
| `Input` / `Select` / `Textarea` | —                                                                                                                     | `focus:ring-2 focus:ring-blue-500`                                       | `invalid` prop → `border-red-500 focus:ring-red-500`; `disabled:opacity-60` |
| `Checkbox`                      | tone `blue` (default, selection) or `yellow` (favorite/star toggle); sizes `sm`/`md`                                  | native focus ring via `focus:ring-*`                                     | —                                                                           |
| `Badge`                         | 9 tones (see [Colors](#colors))                                                                                       | static — a pill never has interactive states                             | —                                                                           |
| `Card`                          | —                                                                                                                     | — (a `Card` is a container, not itself interactive)                      | —                                                                           |
| `Modal`                         | sizes `sm`/`md`/`lg`; position `center` or `bottom` (mobile sheet)                                                    | Escape closes it, focus-trapped, backdrop click closes it                | —                                                                           |
| `Alert`                         | tone `error` (default) or `success`                                                                                   | —                                                                        | —                                                                           |
| `Skeleton`                      | — (pulsing block, no default size/radius — pass both)                                                                 | —                                                                        | —                                                                           |
| `Spinner`                       | size `sm`/`md`; tone `gray` (default) or `white` (inside a filled colored button)                                     | —                                                                        | —                                                                           |
| `ProgressBar`                   | — (`value`/`max`, clamped 0–100%)                                                                                     | —                                                                        | —                                                                           |
| `EmptyState`                    | size `default` (icon + message + optional action) or `compact` (text-only, used inside analytics panels)              | —                                                                        | —                                                                           |
| `FormLabel`                     | size `sm` (default, full-page forms) or `xs` (compact panel forms — no dark-mode color variant)                       | —                                                                        | —                                                                           |

A sidebar/settings **nav item**'s active state is the recurring pattern behind several of the above: `bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/20 dark:text-blue-300`, versus an idle item's `text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700`.

## Dark mode

Dark mode is a **`.dark` class toggle** (`@custom-variant dark (&:where(.dark, .dark *));`), not `prefers-color-scheme`. Every `dark:` utility only activates when a `.dark` class is present on an ancestor — it will not respond to the OS preference on its own. This means:

- Every color pairing in this document needs its `dark:` counterpart written explicitly; there's no automatic inversion.
- A component previewed in isolation (Storybook, a design tool) needs an ancestor with `className="dark"` to show its dark variant at all.
- `packages/ui` repeats the same `@custom-variant dark` line in its own `styles.css`, hand-duplicated from `apps/web`'s — if the app's dark-mode strategy ever changes, that copy needs to change too.

## Do's and don'ts

**Do**

- Reach for a `packages/ui` component before writing new button/input/badge markup.
- Stay on Tailwind's stock color and spacing scale — no arbitrary hex values, no custom spacing steps.
- Write every color pairing with its `dark:` counterpart in the same class list.
- Lay out sibling elements with `flex`/`grid` + `gap-*`, not margins between them.
- Read `apps/web/src/features/applications/lib/statusColors.ts` before touching anything that colors an application status — there is exactly one map.
- Pair a color with text/an icon for anything meaningful (status, error, success) — never color alone.
- Draw icons as inline stroke SVG (lucide-react) at a consistent weight.

**Don't**

- Invent a new shade of blue for "primary" — it's `blue-600`/`blue-700` (light) or `blue-400` (dark text), full stop.
- Add a design-token layer, a theme file, or CSS-in-JS — this app has deliberately never had one.
- Use `prefers-color-scheme` for anything — dark mode is the `.dark` class, always.
- Use emoji or icon fonts in place of lucide-react strokes.
- Ship an interactive control (button, input, icon button) without an explicit disabled state.
- Give a `Card` a default padding inside the component — callers pass it, every time.
- Introduce a fourth border radius, or a heavy shadow on an element that isn't an overlay.
