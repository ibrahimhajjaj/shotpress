# shotpress

App Store / Google Play screenshot sets from a JSON spec. Framed device mockups
on styled backgrounds with headlines, ratings, callouts and badges — rendered
headless at exact store pixel sizes.

<p>
  <img src="https://raw.githubusercontent.com/ibrahimhajjaj/shotpress/main/assets/showcase-01.png" width="30%" alt="hook screen">
  <img src="https://raw.githubusercontent.com/ibrahimhajjaj/shotpress/main/assets/showcase-02.png" width="30%" alt="posed devices screen">
  <img src="https://raw.githubusercontent.com/ibrahimhajjaj/shotpress/main/assets/showcase-03.png" width="30%" alt="feature screen">
</p>

*shotpress rendered this set from its own spec — see `assets/showcase.json`.*

```bash
npx shotpress new --pack saas --app-name "MyApp" --out project.json
# edit copy, point device layers at your real app screenshots
npx shotpress render-all project.json --stores appstore,play --zip
```

## Commands

| command | what it does |
|---|---|
| `render <project.json>` | render every screen to PNG/JPEG/SVG (`--3d` renders phones/tablets as real WebGL 3D devices with glass, reflections and a grounded shadow; `--contact` for a whole-set montage; `--fonts <dir>` for offline custom faces) |
| `render-all <project.json>` | batch-render at every store size (`--stores appstore,play,mac,watch`) |
| `new` | scaffold a project (`--pack`, `--format`, `--app-name`, `--accent`, `--screens`, `--honest` to drop demo social proof, `--kitchen-sink` for a one-of-every-layer reference) |
| `capture <url>` | screenshot a live web app at device-correct viewport/DPR (`--routes` or `--discover`, `--dark`, `--cookies`, `--wait-selector`) |
| `simshot <ios\|android>` | screenshot the booted simulator/emulator; `--flow` runs a [Maestro](https://maestro.mobile.dev) flow and collects its `takeScreenshot` output; `--video` records instead (with `--flow`: the whole driven session) |
| `variants <project.json>` | emit validated, lint-scored A/B variant projects for App Store custom product pages |
| `edit <project.json>` | open the visual editor in a browser; every change autosaves back to the file |
| `watch <project.json>` | live board in your browser, synced both ways with the file — watch a set compose as it's edited, hand-tweak it, then hit Export for store-exact PNGs; self-contained/offline (`--window` for a dedicated Chromium window, `--no-open` to just print the URL) |
| `frames [install]` | official Apple bezels, downloaded from Apple's CDN after accepting Apple's terms — never bundled |
| `lint <project.json>` | design-quality findings: type scale, contrast, social proof, safe zones, composition rhythm, text collisions (`--measure` for line-count/bbox per layer without rendering, `--rules` to list every rule + threshold) |
| `packs` / `formats` | list options as JSON |
| `schema` | authoritative layer schema — every type, its fields, enums and defaults (`--markdown` for a catalogue); `pose` lists 3D device poses, `components` lists compound layers |
| `resolve <project.json>` | expand a project's `tokens`/`styles`/`decorations`/`pose` design system into concrete layers |
| `decor [kind]` | generate on-brand SVG depth (aurora mesh, grain, glow, blob, rings, waves, image `mask`); `--json` prints a paste-ready `bg`/layer snippet, `--seed` keeps a set consistent |
| `validate <project.json>` | schema check, non-zero exit + JSON errors on failure |

All commands are non-interactive. `--json` prints a manifest to stdout so the
CLI composes with scripts and agents. Render options: `--format`, `--out`,
`--type png|jpeg|svg`, `--scale`, `--screens 1,3,5`, `--name`, `--zip`.
Outputs overwrite by filename — give concurrent runs distinct `--out` dirs.

## Formats

iPhone 6.9″/6.5″, iPad 13″/11″, Android phone/tablet, Play feature graphic,
Mac, Apple Watch. `shotpress formats` prints design and output pixel sizes.
Output is store-exact (1290×2796, 2048×2732, 1024×500, …); Android phone comes
out 1080×2160 to preserve the design aspect, which Play accepts.

## Starter packs

Nine themed packs, 10 screens each, with realistic copy to rewrite:
Flow (productivity), Pulse (fitness), Ledger (finance), Circle (social),
Munch (food), Atlas (SaaS), Shelf (e-commerce), Nova (AI), Secure (privacy).
Ready-made specs for each live in `templates/`.

Community packs are npm packages named `shotpress-pack-<id>` carrying a
data-only `pack.json` (see `examples/shotpress-pack-sample/`); install one and
`--pack <id>` finds it. Local pack files work too.

RTL sets: `render --rtl` mirrors the whole layout by coordinate math (Cairo is
vendored for offline Arabic); supply translated copy and RTL app captures.

## Project spec

A project is `{ format, brand, screens[] }`; each screen is a background plus
layers (device, text, rating, callout, badge, logo, image, shape, icon,
feature row). Text supports inline markup: `*accent*`, `**highlight**`,
`~gradient~`. Device layers take a `kind`, bezel, camera cutout, treatment
(plain/bleed/angled/compare/duo/pano/multi) and a free 3D pose (`rx3d`/`ry3d`).
`image` fields accept local paths or data URLs.

Positions are design-space px for the project's format. Rendering with a
different `--format` reflows the layout deterministically — no manual
re-positioning between iPhone, iPad, Android and feature-graphic sizes.

## How it renders

The visual engine (`src/engine/`) is an HTML editor + renderer; the CLI drives
it in headless Chromium via Playwright: inject the project state, lay all
screens out on the board, then screenshot each one at
`deviceScaleFactor = realW / designW`. A real browser engine means gradients,
backdrop blurs and 3D device poses come out pixel-perfect.

Renders are hermetic by default: React and the default font families
(Space Grotesk, Manrope, Instrument Serif) ship vendored and are served from a
loopback server, so results don't depend on a CDN being up. Other Google Fonts
families load from the network; a family that can't load fails the render by
name instead of silently swapping in a system font. Set `SHOTPRESS_NO_NETWORK=1`
to hard-block everything but the loopback (CI determinism).

Browser resolution order: `--browser-path`, Playwright's cached Chromium,
system Google Chrome. If none exists the error tells you the exact
`npx playwright-core install chromium` command to run.

Tests: `npm test` (no browser needed) and `npm run test:e2e` for the full
render smoke.

## fastlane

`render-all --fastlane --locale en-US` additionally copies the output into the
layout fastlane expects — `fastlane/screenshots/<locale>/` for deliver (device
slots are inferred from the store-exact dimensions) and
`fastlane/metadata/android/<locale>/images/` for supply, feature graphic
included. Point your Deliverfile/Fastfile at it and upload.

## Official device frames

The built-in bezels are CSS-drawn and ship with the package. For Apple's
official product bezels: `shotpress frames install --accept-apple-terms`
downloads them directly from Apple's CDN (they are licensed for App Store
marketing by Apple Developer Program members and can't be redistributed, so
they are never bundled). Then set `"frame": "iphone"` on a device layer —
the screenshot is fitted into the bezel's measured screen opening. Apple's
terms require the artwork as-is: `lint` flags any rotation or 3D pose on a
framed device. macOS only for now (the artwork ships as .dmg).

## Design, not just rendering

`lint` encodes a numeric design doctrine — narrative arc, a 3-tier type scale,
copy word-count caps, WCAG contrast against gradient stops, store-UI safe
zones, composition rhythm — so an agent (or CI) can critique a set before
pixels exist. The full doctrine lives in `skills/shotpress/DESIGN.md`.

## Claude Code plugin

The repo doubles as a Claude Code plugin — a `shotpress` skill that teaches
the capture → compose → lint → render loop plus the design doctrine, and a
`/screenshots` command that builds a full store set for the current app.
It hosts its own marketplace:

```
/plugin marketplace add ibrahimhajjaj/shotpress
/plugin install shotpress@shotpress
```

## License

PolyForm Noncommercial 1.0.0: free for personal, educational, research, and
nonprofit use. Commercial use needs a separate license — open a GitHub issue
if you want one. Bundled fonts and React keep their own licenses (see NOTICE).
