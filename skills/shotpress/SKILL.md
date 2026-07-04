---
name: shotpress
description: Generate App Store / Google Play screenshot sets from the command line. Use when the user wants store screenshots, device mockups, app store images, a feature graphic, or asks to prepare store listing assets from their app screenshots.
---

# Shotpress — store screenshot sets

Shotpress renders App Store / Google Play screenshot sets from a JSON project
spec: framed device mockups on styled backgrounds with headlines, ratings,
callouts and badges, at exact store pixel sizes. Everything runs through
`npx shotpress` — non-interactive, JSON in, files out.

## Workflow

1. **Discover options**

```bash
npx shotpress packs      # 9 built-in packs + any installed shotpress-pack-* npm packages
npx shotpress formats    # 9 store formats with design + real px sizes
```

Community packs: `npm i shotpress-pack-<id>` makes it available to `--pack <id>`;
a local pack file also works (`--pack ./my-pack.json`). Packs are data-only
templates — validated, never executed.

2. **Scaffold a project** — pick the pack whose category matches the app:

```bash
npx shotpress new --pack secure --format iphone --app-name "MyApp" --accent "#6d5cf5" --out project.json
```

Without `--pack` you get `--screens <n>` blank screens to compose manually.

2b. **Capture the real app.** Three ingestion paths; pick by what's running:

- **Web app on a URL** — device-correct viewport/DPR captures; `--dark`,
  `--wait-selector`, `--cookies` cover themed and authenticated apps:

```bash
npx shotpress capture https://localhost:3000 --routes /,/dashboard,/settings --format iphone --out captures --json
```

Don't know the routes? `--discover` finds them (sitemap → same-origin links →
common paths), capped by `--max-routes`.

- **Native app in the iOS Simulator / Android emulator** — screenshot whatever
  is on screen right now (navigate it first, or let the user):

```bash
npx shotpress simshot ios --name dashboard --out captures --json
```

- **Maestro-orchestrated** (best for full sets): write a Maestro flow that
  drives the app screen by screen with a `takeScreenshot:` step at each stop,
  then let simshot run it and collect the PNGs:

```bash
npx shotpress simshot ios --flow screens.yaml --out captures --json
```

iOS simulator screenshots come out at native device pixels (a 6.9″ simulator
gives 1320×2868 — already store-tier). Drop the resulting paths into the
device layers' `image` fields either way.

- **App preview videos**: add `--video` — alone it records `--duration <s>`
  (default 20), with `--flow` it records the entire Maestro-driven session and
  still collects the flow's screenshots. App Store previews must be 15–30s at
  specific resolutions; record on a 6.9″ simulator and trim/scale with ffmpeg:
  `ffmpeg -i preview.mp4 -t 30 -vf scale=886:1920 -r 30 preview-store.mp4`.

3. **Edit `project.json`** — the spec is plain JSON:

- Headlines are `text` layers. Inline markup: `*word*` → accent color,
  `**word**` → highlight chip, `~word~` → gradient text. `\n` breaks lines.
- Put the user's real app screenshots on the `image` field of `device` layers —
  local file paths (relative to project.json) or data URLs both work.
- `bg.value` takes any CSS color or gradient; `bg.type` is solid | gradient | image.
- Device layers: `kind` (phone/tablet/mac/watch), `bezel` (black/white/clay),
  `notch` (auto/island/notch/punch/none), `treatment` (plain/bleed/angled/
  compare/duo/pano/multi), and `rx3d`/`ry3d` for a 3D perspective pose.
- Positions (`cx`/`cy`) are design-space px for the project's format (e.g.
  iPhone is a 360×780 canvas). Don't hand-convert between formats — rendering
  with `--format` reflows automatically.

4. **Design like a system, not a template.** Read DESIGN.md in this skill
directory before rewriting copy or composition — it's the doctrine that
lifts a set well past pack defaults (narrative arc, type scale, copy
formulas, treatment schedule), and every rule is numeric.

5. **Lint, render, self-review, iterate**

```bash
npx shotpress lint project.json --json     # numeric design critique
npx shotpress validate project.json
npx shotpress render project.json --out shots --json          # one format
```

Fix lint findings, then render one format and actually look at the PNGs — full
size for collisions and promise-clarity, and downscaled to ~120px for
thumbnail legibility (screens 1–3 must read at search-result size). Iterate
until clean, then:

```bash
npx shotpress render-all project.json --stores appstore,play --zip --json
```

`render-all` writes `<out>/<store>/<format>/screen-NN.png` at every required
store size. `--json` prints a machine-readable manifest to stdout.

6. **RTL markets (Arabic, Hebrew).** Translate every text/title/sub string,
set text fonts to `'Cairo', sans-serif` (vendored, works offline), and render
with `--rtl` — the layout mirrors by coordinate math (positions, rotations,
3D yaw, aligns, callout arrows, feature-row direction) while device
screenshots stay unflipped. Supply RTL app captures for the frames.

7. **A/B variants for Apple custom product pages.** Write a patches file
(`{ "variants": [{ "id": "b", "screens": { "1": <replacement screen> } }] }`)
that changes ONE variable per variant — usually the screen-1 hook — then:

```bash
npx shotpress variants project.json --patches patches.json --out cpp --render --json
```

Each variant is validated, lint-scored, and optionally rendered into its own
folder, ready for CPP uploads.

8. **Human handoff.** When the user wants to fine-tune by hand, run
`npx shotpress edit project.json` — the full visual editor opens in their
browser and every change autosaves back to the file. Local image paths are
preserved on save. Pick the loop back up afterwards with lint + render.

## Notes

- Browser resolution: Playwright's cached Chromium, then system Google Chrome.
  If neither exists the error names the exact install command; CI images with
  their own Chromium can pass `--browser-path`.
- Exit codes: 0 ok, 1 validation/render failure (JSON error on stderr),
  2 bad usage, 3 no browser.
- Android phone output is 1080×2160 (the design's 1:2 aspect); Play accepts it.
  All other formats come out store-exact (e.g. 1290×2796 for iPhone 6.9″).
- Templates for all 9 packs live in `templates/` as starting points.
