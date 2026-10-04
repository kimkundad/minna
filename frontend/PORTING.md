# Porting a reference page to Vue

The reference prototype lives in `_design-ref/`. It builds its markup in
JavaScript at runtime, so its `.html` files are 33-65 line shells and the real
structure comes out of `assets/js/ui.js` and `assets/js/pages/*.js` — about
6,900 lines of it.

**Do not read that source to work out what the DOM becomes.** Run the page and
take the DOM it produced. Reading the generator is slow and gets details wrong;
the dump is the truth.

## The loop

```bash
npm run ref:serve      # serves _design-ref on :5180, with a /__seed route
npm run ref:dump       # writes .reference-dom/<page>.main.html for every page
npm run dev            # our app on :5174
```

1. Open `.reference-dom/<page>.main.html`. That is the exact markup to produce.
2. Write the page as an SFC under `src/pages/`, reusing the components below.
3. Screenshot both and compare:

```bash
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
FLAGS="--headless=new --disable-gpu --hide-scrollbars --force-prefers-reduced-motion --window-size=1440,1400 --virtual-time-budget=12000"
"$EDGE" $FLAGS --screenshot=/tmp/ref.png  "http://localhost:5180/courses.html"
"$EDGE" $FLAGS --screenshot=/tmp/ours.png "http://localhost:5174/th/courses"
```

Always pass `--force-prefers-reduced-motion`. Without it the hero carousel and
section animations are mid-flight when the shutter opens and nothing lines up.

4. `npm run typecheck` has to pass before the page is done.

> Use the script, not `vue-tsc --noEmit`. This project uses a solution-style
> tsconfig, and `--noEmit` walks none of its references: it exits 0 on code that
> does not compile. The script runs `--build`, which actually checks.

### Pages that need a session

`/__seed?state=paid&to=account.html` writes the prototype's session and
forwards, because several pages render only a sign-in gate otherwise. States are
`guest`, `free` and `paid`. `.reference-dom/` already holds a paid capture of
each, plus `account-free` and `account-learning-free` for the empty states.

## What already exists

Shared components, all built from the reference markup element for element:

| Component | Use |
|---|---|
| `ui/AppIcon` | any icon; `name` is an `icons.js` key |
| `ui/AppBadge` | `badge` from `courseView().badges`; `on-media` over a thumbnail |
| `ui/AppPrice` | price with struck-through normal price, or the free form |
| `ui/AppProgress` | progress bar; 100% styles itself, there is no `done` prop |
| `ui/AppAvatar` | photo or initials on a palette colour |
| `ui/AppNotice` | info / success / warning / danger / neutral / proto |
| `ui/CtaButton` | one action from `courseView`; emits `run` |
| `ui/AdsSlot` | reserved advertising block |
| `course/CourseImage` | local or remote image, with generated art on failure |
| `course/CourseCard` | `grid`, `list` and `continue` variants |
| `course/CourseRail` | scrolling row with its own arrows |
| `course/InstructorLine` | avatar stack and names |
| `layout/SiteHeader`, `layout/SiteFooter` | page chrome, rendered by `App.vue` |

Data and business rules come from `src/vendor` — the prototype's `icons.js`,
`data.js` and `store.js`, vendored unchanged:

```ts
import { store, data, courseView, RV } from '@/vendor'
store.catalog() · store.course(id) · store.myCourses() · store.cart() …
courseView(courseId)   // every CTA, badge and lock decision
```

Formatters are in `src/lib/format.ts`: `num`, `baht`, `date`, `dateLong`,
`dateTime`, `relative`, `minutes`, `clock`, `levelShort`, `pct`.

## Rules

**Never hardcode a visible string.** Everything goes through `$t()`, with the
Thai text in `src/locales/th.json` and the English in `en.json`. `jp.json` and
`vn.json` are English for now; copy the new keys across so they do not fall back
silently. Pull the Thai out of the dump as you go — retrofitting i18n across
eighteen pages afterwards is a rewrite.

**Keep the markup.** Same elements, same classes, same nesting, same `aria-*`.
The CSS is the reference's, unchanged, and it leans on both structure and class
names. If a class looks redundant, it is load-bearing somewhere.

**Links carry the locale.** `` `/${locale}/courses` ``, never `/courses`. Read
it from `route.params.locale`.

**Add a route with its meta.** `headerVariant` is `solid` unless the page opens
with full-bleed media, and `headerActive` highlights the nav item.

**Styles belong in the ported CSS.** Minna's own deviations go in
`src/assets/css/brand.css`, which loads last. Do not edit the ten files copied
from the reference, and do not add `<style scoped>` to a page.

## Mistakes already made here, so you do not have to

**An icon must render a bare `<svg>`.** The CSS sizes icons through child
combinators — `.icon-btn > svg`, `.avatar-btn > svg` — and any wrapper breaks
every one of them, `display: contents` included: that changes layout, not what
selectors match. Icons then fall back to 24px and push layouts apart. `AppIcon`
already renders bare; do not wrap it.

**`@` in a locale string breaks vue-i18n.** It is linked-message syntax, so
`contact@minna.example` fails to compile and takes the whole render down. Write
`contact{'@'}minna.example`.

**Type sizes are already rescaled; leave them alone.** The reference was set in
DB Heavent, a licensed face whose Thai consonants are 0.420em against Noto Sans
Thai's 0.570em. `scripts/rescale-type.mjs` and `scripts/rescale-display.mjs`
have taken that out — body text matched to height, display text matched to
width so headlines keep their line breaks. If something looks too large, it is
a size inside a `clamp()` the scripts missed; fix it there, not in the page.

**Run one dev server.** Two Vite instances on neighbouring ports make the page
load its modules twice and render everything twice. If the header appears
twice, check for a second server before suspecting the code.

**Images in the fixture data use literal paths** (`assets/img/...`), served out
of `public/`. Run `npm run fixtures:images` once; they are not committed.
