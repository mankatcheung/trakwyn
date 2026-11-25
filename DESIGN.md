# Trakwyn Design System

A description of Trakwyn's visual language for anyone — human or AI agent — building UI in this codebase. There is no design-token layer, no theme file, and no CSS-in-JS: every surface is styled with directly-authored [Tailwind CSS v4](https://tailwindcss.com) utility classes on Tailwind's **stock** color/spacing/type scale. This document is the closest thing to tokens Trakwyn has — read it before inventing a new color, spacing value, or component pattern.

The canonical component set lives in `packages/ui` (`Button`, `IconButton`, `Input`, `Select`, `Textarea`, `Checkbox`, `FormLabel`, `Badge`, `Card`, `Modal`, `Alert`, `Skeleton`, `Spinner`, `ProgressBar`, `EmptyState`) and is consumed by `apps/web`. **Reach for one of these before hand-rolling a new button, input, or pill** — a new one-off risks another shade of "primary blue" existing in the app.

The look is quiet on purpose: warm stone neutrals, one ink-blue accent, medium-weight type, and no decoration. Color is reserved for the accent and for meaning (status, error, success), and the richest thing on a screen should be the product's own content. The mobile app (`apps/mobile/src/theme/colors.ts`) and the Clipper popup (`apps/extension/src/entrypoints/popup/popup.css`) use the same palette in hex, so a change here needs the same change there.

## Brand

The mark (`apps/web/src/components/LogoMark.tsx`) is two chevrons at unequal weight — a position and the position it came from — always drawn as inline SVG (`stroke: currentColor`), never a raster logo file, so it follows text color and theme automatically:

- Foreground color: `text-blue-700 dark:text-blue-400` (the `MARK_COLOR` constant). The mark keeps its own shade, one step lighter than the `blue-800` action fill, and lifts to `blue-400` in dark mode (see [Colors](#colors)).
- Solid-tile assets (favicon, app icon, extension icon) are white on a blue tile (`#1D4ED8`, which is `blue-700`) and have no theme to follow.

No custom brand typeface — see [Typography](#typography).

## Colors

Tailwind's stock palette, used semantically. Every color below needs a `dark:` counterpart wherever it appears — see [Dark mode](#dark-mode).

### Neutral (structure & text)

Warm `stone`, never `gray`. Surfaces, borders and text all come from this one ramp, so the app reads as one material.

| Role                        | Light                                | Dark                            |
| --------------------------- | ------------------------------------ | ------------------------------- |
| Page background             | `bg-stone-50` (`#fafaf9`)            | `dark:bg-stone-900` (`#1c1917`) |
| Card / panel background     | `bg-white`                           | `dark:bg-stone-800`             |
| Sidebar / header background | `bg-white`                           | `dark:bg-stone-800`             |
| Border, default             | `border-stone-200`                   | `dark:border-stone-700`         |
| Border, form control        | `border-stone-300`                   | `dark:border-stone-600`         |
| Heading text                | `text-stone-900`                     | `dark:text-stone-100`           |
| Body text                   | `text-stone-700`                     | `dark:text-stone-300`           |
| Muted / secondary text      | `text-stone-500` or `text-stone-600` | `dark:text-stone-400`           |
| Placeholder / disabled text | `text-stone-400`                     | (unchanged)                     |

Three text roles only: primary (heading), secondary (body) and muted. Borders are quiet hairlines, never a heavier color.

### Accent — blue

The one brand color, an ink blue. `blue-800` is the primary action surface (white text on it clears 4.5 to 1); `blue-900` is its hover. In dark mode the fill steps up to `blue-600` (hover `blue-700`), because `blue-800` sinks into a `stone-900` page, and `blue-400` is what blue lifts to for **text**.

| Use                             | Classes                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| Primary button / CTA fill       | `bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-700`, white text |
| Link / accent text              | `text-blue-800 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300`     |
| Active nav item                 | `bg-blue-50 font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-400`       |
| Info callout background         | `bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900`               |
| Focus ring (every form control) | `focus:ring-2 focus:ring-blue-500`                                                  |

Use the accent rarely: the primary action, the selection, the one number that matters. Anything with text on top of the accent must reach 4.5 to 1 contrast in both themes, and accent used as text on a light surface uses the darker `blue-800`, not a lighter shade.

### Semantic status colors

| Meaning             | Color                                      | Typical use                                                                                                             |
| ------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Destructive / error | red (`red-600` fill, `text-red-600` alone) | Delete/revoke actions, `Alert tone="error"`, invalid-field border (`border-red-500`)                                    |
| Success             | green                                      | `Alert tone="success"`, confirmation text, a "Recommended" badge                                                        |
| Caution             | amber/yellow                               | Inline warning callouts (`bg-amber-50 border-amber-200`), a "full access" scope badge (`bg-yellow-100 text-yellow-700`) |
| Neutral tag         | stone/slate                                | Default `Badge` tone, a "read-only" scope badge                                                                         |

`Badge` (`packages/ui/src/Badge.tsx`) is the canonical set of tag/status pill colors — **9 tones**: `gray`, `slate`, `blue`, `purple`, `yellow`, `orange`, `green`, `red`, `emerald`. The `gray` tone keeps its name but renders the warm `stone` ramp. Don't reach past this list for a new pill color without a real reason. Hue is for meaning: a tag that only labels something (a skill, a keyword) is neutral, and the status is the one colored chip in a row.

**Application status has one canonical color map, and only one.** `apps/web/src/features/applications/lib/statusColors.ts` is the single source of truth for every status's `Badge` tone, dot color, and board-column accent — draft (neutral), applied (blue), interviewing (purple), offered (orange), accepted (green), rejected (red), withdrawn (slate). Before this map existed, the board and the status badge each carried their own mapping and disagreed on three of seven statuses; the same application changed color depending on which screen you looked at. **Anything that colors a status reads this map** — never hand-pick a color for a status inline. And per that file's own rule: **color is never the only cue** — every surface using these colors also shows the localized status text next to it.

## Typography

No custom typeface — Tailwind's default system-font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ...`). Don't add a webfont without a real reason; this app has never needed one.

| Class       | Size / line-height | Where it's actually used                                                                                           |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `text-xs`   | 12px               | Badge/pill text, helper text under a field, timestamps — **the smallest size; nothing goes below it**              |
| `text-sm`   | 14px               | **The base UI size** — body copy, buttons, inputs, labels, nav items; nothing in `packages/ui` is larger than this |
| `text-base` | 16px               | Marketing-page body paragraphs (often `text-base/7` for looser leading)                                            |
| `text-lg`   | 18px               | Marketing sub-headline copy                                                                                        |
| `text-xl`   | 20px               | A guide/article `h2`                                                                                               |
| `text-2xl`  | 24px               | A settings page's `h1` (e.g. "Settings"), a marketing benefit `h2`                                                 |
| `text-3xl`  | 30px               | A guide/hero `h1`, a CTA-band `h2`                                                                                 |
| `text-4xl`  | 36px               | A `/features/*` hero `h1` at rest, the landing hero `h1` at rest                                                   |
| `text-5xl`  | 48px               | A feature or pricing hero `h1` at `sm:` and up                                                                     |
| `text-6xl`  | 60px               | The landing hero `h1` at `sm:` and up — the largest text in the app                                                |

Weight: `font-normal` for body copy and `font-medium` for everything that needs emphasis — labels, nav, buttons and headings alike. There is no `font-semibold` or `font-bold` anywhere: hierarchy comes from size and color, not weight. `tracking-tight` pairs with the largest hero headings. A small section label (an eyebrow, a table-of-contents group heading) is sentence case in `text-xs font-medium text-stone-500 dark:text-stone-400` — never `uppercase` and never `tracking-wide`. The one `uppercase` left is a file-type tag such as `PDF`.

Numbers that line up in a column use `tabular-nums`.

## Spacing & layout

Tailwind's default spacing scale, no custom steps, and everything sits on the 4px grid. Prefer `gap-*` on `flex`/`grid` over margins between siblings — spacing that survives a sibling being added, removed, or reordered without every neighbor's margin needing a rethink.

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
| Page container width                 | `max-w-4xl` (settings), `max-w-5xl` (dashboard), `max-w-6xl` (marketing)                                                                    |

## Radii & elevation

Radii follow the nesting rule: an inner radius is the outer radius minus the padding between them. In practice there are three everyday radii and two specific ones — don't introduce another without a reason:

| Radius         | Used for                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| `rounded-lg`   | Buttons, inputs, select, textarea, alerts, list rows — the default for almost everything interactive |
| `rounded-xl`   | `Card`, the `Modal` panel — anything read as a distinct "surface"                                    |
| `rounded-full` | `Badge` pills, avatars, status dots                                                                  |
| `rounded-md`   | Compact floating menus and popovers (the editor bubble and slash menus)                              |
| `rounded-2xl`  | Large framed images and feature cards on marketing and guide pages, and the top of the `Modal` sheet |

Elevation is understated: `shadow-sm` for a resting card, `shadow-lg` (or `shadow-xl` for the mobile sidebar drawer) only for overlays (a `Modal`, a menu, a popover). Shadows are neutral, soft and small, never tinted. In dark mode depth comes from surface steps and hairline borders more than from shadow. Nothing at rest on the page carries a heavy shadow.

## Icons

[lucide-react](https://lucide.dev) exclusively — stroke-based, 24px viewBox, `stroke-width: 2`, round caps/joins. **Never emoji, never a filled/glyph icon font.** Sizes in practice: 16px in a dense sub-nav, 18px in the main sidebar, 24px in a page header or hero eyebrow. Icons take the color of their text role (usually `text-stone-500 dark:text-stone-400`), never a hue of their own; a category that needs color gets a small status dot instead. An icon-only control always carries an accessible name via `IconButton`'s required `label` prop (rendered as both `aria-label` and `title`) — there is no icon-only button anywhere without one.

## Components & states

| Component                       | Variants                                                                                                              | Hover / focus                                                             | Disabled / invalid                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `Button`                        | `primary` (blue fill), `destructive` (red fill), `secondary` (bordered), `ghost` (text-only), `link`; sizes `sm`/`md` | Each variant darkens/underlines on hover (e.g. `hover:bg-blue-900`)       | `disabled:opacity-60` on every variant, no separate disabled color          |
| `IconButton`                    | `default`, `danger` (hover → red), `subtle` (hover gets a bg); sizes `sm`/`md`                                        | Icon color shifts from `text-stone-400` to a darker/danger shade on hover | `disabled:opacity-30 disabled:cursor-not-allowed`                           |
| `Input` / `Select` / `Textarea` | —                                                                                                                     | `focus:ring-2 focus:ring-blue-500`                                        | `invalid` prop → `border-red-500 focus:ring-red-500`; `disabled:opacity-60` |
| `Checkbox`                      | tone `blue` (default, selection) or `yellow` (favorite/star toggle); sizes `sm`/`md`                                  | native focus ring via `focus:ring-*`                                      | —                                                                           |
| `Badge`                         | 9 tones (see [Colors](#colors))                                                                                       | static — a pill never has interactive states                              | —                                                                           |
| `Card`                          | —                                                                                                                     | — (a `Card` is a container, not itself interactive)                       | —                                                                           |
| `Modal`                         | sizes `sm`/`md`/`lg`; position `center` or `bottom` (mobile sheet)                                                    | Escape closes it, focus-trapped, backdrop click closes it                 | —                                                                           |
| `Alert`                         | tone `error` (default) or `success`                                                                                   | —                                                                         | —                                                                           |
| `Skeleton`                      | — (pulsing block, no default size/radius — pass both)                                                                 | —                                                                         | —                                                                           |
| `Spinner`                       | size `sm`/`md`; tone `gray` (default, renders `stone`) or `white` (inside a filled colored button)                    | —                                                                         | —                                                                           |
| `ProgressBar`                   | — (`value`/`max`, clamped 0–100%)                                                                                     | —                                                                         | —                                                                           |
| `EmptyState`                    | size `default` (icon + message + optional action) or `compact` (text-only, used inside analytics panels)              | —                                                                         | —                                                                           |
| `FormLabel`                     | size `sm` (default, full-page forms) or `xs` (compact panel forms — no dark-mode color variant)                       | —                                                                         | —                                                                           |

A sidebar/settings **nav item**'s active state is the recurring pattern behind several of the above: `bg-blue-50 text-blue-800 font-medium dark:bg-blue-900/20 dark:text-blue-400`, versus an idle item's `text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-100`. The active state is a small surface step, not a gradient or a glow.

Motion is for feedback only. Transition the properties that change and name them (`transition-colors`, `transition-[transform,opacity]`, `transition-[width]`) — never `transition-all`. A looping animation (`animate-pulse`, a spinner) belongs only on something that is actually loading.

## Dark mode

Dark mode is a **`.dark` class toggle** (`@custom-variant dark (&:where(.dark, .dark *));`), not `prefers-color-scheme`. Every `dark:` utility only activates when a `.dark` class is present on an ancestor — it will not respond to the OS preference on its own. This means:

- Every color pairing in this document needs its `dark:` counterpart written explicitly; there's no automatic inversion.
- A component previewed in isolation (Storybook, a design tool) needs an ancestor with `className="dark"` to show its dark variant at all.
- `packages/ui` repeats the same `@custom-variant dark` line in its own `styles.css`, hand-duplicated from `apps/web`'s — if the app's dark-mode strategy ever changes, that copy needs to change too.
- The one place the OS preference is read is the browser chrome: the two `theme-color` meta tags in `routes/__root.tsx` use `media="(prefers-color-scheme: …)"` (`#fafaf9` light, `#1c1917` dark), because the browser reads them before any `.dark` class exists. `public/manifest.webmanifest` can hold only one value, so its `theme_color` and `background_color` are the light page color; `src/__tests__/config/manifestColors.test.ts` keeps them equal to the light meta tag and to the page background.

## Do's and don'ts

**Do**

- Reach for a `packages/ui` component before writing new button/input/badge markup.
- Stay on Tailwind's stock color and spacing scale — no arbitrary hex values, no custom spacing steps.
- Take neutrals from `stone` and the one accent from `blue-800`; write every color pairing with its `dark:` counterpart in the same class list.
- Use `font-normal` and `font-medium` only, and `text-xs` (12px) as the smallest size.
- Lay out sibling elements with `flex`/`grid` + `gap-*`, not margins between them.
- Read `apps/web/src/features/applications/lib/statusColors.ts` before touching anything that colors an application status — there is exactly one map.
- Pair a color with text/an icon for anything meaningful (status, error, success) — never color alone.
- Draw icons as inline stroke SVG (lucide-react) at a consistent weight.
- Check the contrast of any new text/background pairing against 4.5 to 1, in both themes.

**Don't**

- Invent a new shade of blue for "primary" — it's `blue-800`/`blue-900` (light), `blue-600`/`blue-700` as a dark-mode fill, or `blue-400` (dark text), full stop.
- Use `gray` for neutrals, or `font-semibold`/`font-bold`, or text smaller than `text-xs`.
- Add gradients, glows, colored shadows or `transition-all`. The one gradient allowed is a neutral edge fade that hints a list can scroll (`BoardScroller`).
- Set labels in `uppercase` with tracking, or put an emoji, a sparkle or a colored tile on an icon.
- Add a design-token layer, a theme file, or CSS-in-JS — this app has deliberately never had one.
- Use `prefers-color-scheme` for anything but the browser-chrome meta tags — dark mode is the `.dark` class, always.
- Use emoji or icon fonts in place of lucide-react strokes.
- Ship an interactive control (button, input, icon button) without an explicit disabled state.
- Give a `Card` a default padding inside the component — callers pass it, every time.
- Introduce another border radius, or a heavy shadow on an element that isn't an overlay.
