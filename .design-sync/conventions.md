# Trakwyn UI conventions

`@trakwyn/ui` ships 10 components — `Button`, `IconButton`, `Input`, `Badge`, `Modal`, `Textarea`, `Select`, `Card`, `Alert`, `FormLabel` — as plain functional React components. No context/provider wrapper is required: none of them read from React context, so they render correctly standalone with no setup beyond `import { X } from '@trakwyn/ui'`.

- `Select` and `Textarea` share `Input`'s exact bordered/rounded/focus-ring styling and its `invalid` boolean prop (switches to `border-red-500` + `focus:ring-red-500`).
- `Card` ships **no default padding** — call sites range from `p-3` to `p-6`, plus padding-free horizontal list rows — pass it via `className`.
- `Alert` takes a `tone` prop: `'error'` (default, `text-red-600 bg-red-50 dark:bg-red-900/20`) or `'success'` (`text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20`).

## Styling idiom: plain Tailwind utility classes, no custom tokens

There is no design-token layer, no CSS-in-JS, and no `styled-components` — every component is styled with directly-authored Tailwind v4 utility classes, using Tailwind's stock color/spacing scale (not a customized theme). When composing new layout or glue code around these components, match that same vocabulary directly — don't invent custom classes or tokens:

| Purpose                  | Classes actually used in this DS                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Primary action surface   | `bg-blue-800 hover:bg-blue-900 dark:bg-blue-600 dark:hover:bg-blue-700`, white text                                                 |
| Destructive action       | `bg-red-600 hover:bg-red-700`                                                                                                       |
| Neutral/bordered surface | `border border-stone-300 dark:border-stone-600`, `bg-white dark:bg-stone-700` (inputs) or `dark:bg-stone-800` (the Modal panel)     |
| Body/label text          | `text-stone-700 dark:text-stone-200` (Secondary button text), `text-stone-600 dark:text-stone-400` (Ghost button / muted text)      |
| Corners                  | `rounded-lg` (buttons, inputs, select, textarea, alert), `rounded-xl` (Modal panel, Card), `rounded-full` (Badge)                   |
| Type size                | `text-sm` (14px, the base size everywhere) and `text-xs` for Badge / small-button text — nothing larger is used anywhere in this DS |
| Padding                  | Button (md) `px-4 py-2`, Button (sm) `px-3 py-1.5`, Input `px-3 py-2`, Badge `px-2 py-0.5`, IconButton `p-1.5` (md) / `p-1` (sm)    |

The `gap-3`/spacing values in the login-form example below are ordinary composition choices in the same numeric scale (Tailwind's default spacing steps), not classes copied from inside a component — none of these components spaces its own children internally (`Card`/`Modal` render whatever's passed as-is), so there's no shipped "gap" convention to defer to; use judgment consistent with the sizes above.

**Dark mode is a `.dark` class toggle, not `prefers-color-scheme`.** Every `dark:` utility above only activates when a `.dark` class is present on an ancestor element (matching the parent app's convention) — it will NOT respond to OS dark-mode preference on its own. If a design needs a dark-mode preview, add `className="dark"` to a wrapping element.

## Where the truth lives

Read `styles.css` (and what it `@import`s, including `_ds_bundle.css`) before styling anything new — it's the real compiled Tailwind output for this exact component set, so any color/utility mentioned above is guaranteed to resolve there. Each component's `.d.ts` is its exact prop contract; `.prompt.md` has real usage examples per component.

## Example: a login-style form (real composition pattern from this app)

```tsx
import { Input, Button, FormLabel } from '@trakwyn/ui';

function LoginForm() {
  return (
    <form className="space-y-4">
      <div>
        <FormLabel htmlFor="email">Email</FormLabel>
        <Input id="email" type="email" placeholder="you@example.com" />
      </div>
      <Button type="submit" fullWidth>
        Sign in
      </Button>
    </form>
  );
}
```

`FormLabel` renders a `<label>` and takes a `size` prop: `'sm'` (default — `text-sm font-medium text-stone-700 dark:text-stone-300`, the standard full-page form label) or `'xs'` (`text-xs font-medium text-stone-500`, no dark-mode variant — the compact label used in denser panel forms). Pass `htmlFor` like any native `<label>` to associate it with a field.
