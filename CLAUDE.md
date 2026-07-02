# CLAUDE.md

Guidance for working in this repo.

## What this is

A **static** full-screen "On this day" display for digital signage, hosted on
**GitHub Pages**. Each load shows one notable historical event for today's
calendar date, drawn live from the **Wikipedia "On this day" REST feed**. Sibling
to the `quotes` app (same static template); unlike the `weather-app`/`clock-app`
Cloudflare Workers, there is **no server** — just HTML/CSS/JS served as files.

Data flow: the browser reads the local date, fetches
`https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/MM/DD` (CORS-open),
picks an event (preferring one with an image), and renders it. If that fetch
fails — offline signage, API hiccup — it falls back to the small bundled
`fallback.json`, then to one inlined event, so the screen is never blank.

## Stack & conventions

- **Bun** for everything (package manager, bundler, test runner). Use `bun` /
  `bunx` — never npm/npx.
- **TypeScript**, strict. **All** browser JS is authored as `.ts` and bundled by
  Bun — there is no hand-written JS in `assets/`.
- **Tailwind CSS v4**, CSS-first: tokens live in `@theme` in
  `assets/static/styles/tailwind.css`; compiled by `@tailwindcss/cli` at build.
- **Biome** for lint/format: single quotes, no semicolons, 2-space, 100 cols.
  CSS is intentionally excluded from Biome (it doesn't parse Tailwind at-rules).

## Commands

```sh
bun install        # deps; vendored fonts come from @fontsource via sync-fonts
bun run dev        # build + serve dist/ locally
bun run build      # assemble dist/ (see below)
bun test           # bun:test — pure helpers, the feed parser, dataset validation
bun run typecheck  # tsc --noEmit
bun run lint       # biome lint --error-on-warnings
```

## Layout & build

Web root is served from the site root (custom domain), so assets are referenced
absolutely as `/static/...`.

- `index.html` — the page shell. Ships a real event inline so the screen is never
  blank pre-JS. Asset URLs carry `?v=__ASSET_VERSION__`, replaced at build.
- `assets/static/js/events.ts` — **pure, exported, unit-tested** helpers
  (`monthDay`, `pickRandomIndex`, `parseFeed`, `upscaleThumbnail`, `selectEvent`,
  `isEvent`, `formatYear`, `yearsAgo`, the `OnThisDayEvent` type).
- `assets/static/js/main.ts` — the browser **entry**. Fetches the live feed
  (8 s timeout), picks an event, writes it to the DOM, with the bundled/inline
  fallback. Keep it **export-free** and free of top-level `await` so Bun bundles
  it to a self-contained classic script (loads from a plain `<script>`).
- `assets/static/data/fallback.json` — ~14 famous, fact-checked events shown only
  when the live feed is unreachable. Each links a real Wikipedia article; every
  URL is verified. Text-only (no images offline).
- `.well-known/signage-app.json` — the [signage-app manifest](https://github.com/Screenly-Labs/app-store/blob/master/docs/app-manifest.md)
  the app store and players read to render/launch this app. On This Day takes no
  settings and is single-shot (one event per load, no rotation or refresh), so
  the manifest omits `playback`, `settings`, and a launch `template` — `baseUrl`
  alone is the launch URL. `build.js` copies it to `dist/.well-known/` unchanged;
  `test/manifest.test.ts` guards its shape. Served at the site-root well-known
  path with `application/json` + `Access-Control-Allow-Origin: *` (GitHub Pages
  defaults).

`build.js` builds into `dist/` **without mutating sources**: vendor fonts → copy
`index.html` + static assets → compile+minify Tailwind → bundle+minify the TS →
stamp a sha256 content hash into `?v=` URLs → write `CNAME`. `dist/` is gitignored
and is the artifact GitHub Pages publishes.

## Design — "The Record"

An archive-logbook page: today's date pressed in as a cinnabar **stamp** (the
signature), the **year** it happened as the hero in a light Newsreader serif, and
the source article mounted beside it like a tipped-in photographic plate. JetBrains
Mono is the catalog "record" voice for labels, the stamp, the caption, and the
Wikipedia credit. One fluid root font-size (`clamp(vw+vh)`) drives the whole scale
and is orientation-neutral; landscape sets image-beside-text, portrait stacks, and
an imageless event collapses to a centered frontispiece. The single load animation
(the stamp "presses in") is gated behind `prefers-reduced-motion` and keyed off the
`data-state="ready"` flag so a no-JS screen still shows content.

## Wikipedia attribution

Wikipedia text is **CC BY-SA**. The credit is not optional: every screen shows a
`Source · Wikipedia` link to the specific article and a standing "Events from
Wikipedia, CC BY-SA" colophon. Keep both when editing the layout.

## Quality bars

- **Accessibility:** target a 100 Lighthouse/PageSpeed accessibility score —
  semantic landmarks, AA contrast, `lang`, an `alt` on the article image, named
  links, zoomable viewport, reduced-motion respected.
- **Resolutions:** must look correct at every entry in the README table, both
  orientations.
- Run `typecheck`, `lint`, and `test` before pushing (CI enforces them).

## Deploy

Push to **`master`** → `.github/workflows/deploy-pages.yml` builds and publishes
to Pages. PRs run `ci.yml` (typecheck + lint + test + build). Action versions are
SHA-pinned.
