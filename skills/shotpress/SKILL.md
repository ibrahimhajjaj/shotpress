---
name: shotpress
description: Generate App Store / Google Play screenshot sets from the command line. Use when the user wants store screenshots, device mockups, app store images, a feature graphic, or asks to prepare store listing assets from their app screenshots.
---

# Shotpress — store screenshot sets

Shotpress renders App Store / Google Play screenshot sets from a JSON project
spec: framed device mockups on styled backgrounds with headlines, ratings,
callouts and badges, at exact store pixel sizes. Everything runs through
`npx shotpress` — non-interactive, JSON in, files out.

## Know the toolbox first

Don't guess the vocabulary from memory — the tool tells you what it has:

```bash
npx shotpress schema        # every layer type, its fields, enums, and DEFAULTS (--markdown for a table)
npx shotpress lint --rules  # every design rule and its threshold, so you design to spec
npx shotpress new --kitchen-sink --out ref.json   # a project that uses every layer type once
npx shotpress decor         # the background/depth generators
npx shotpress pose          # named 3D device poses
```

The layer types are `device text rating callout badge logo image shape icon
feature` (plus add-keyword aliases `heading`/`circle`/`line`). `LAYERS.md` in
this skill directory is the same catalogue in prose. Read `schema` before
building any layer beyond text/device — half the toolbox (shape, icon, callout,
badge, logo, image) is invisible if you only trust a text-heavy scaffold.

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
`--screens <n>` also trims a pack to its first N screens (packs otherwise emit
10). For a pre-launch app add `--honest`: it omits the pack's demo rating and
quote layers so fabricated social proof can never slip through — supply real
numbers later, or a truthful badge, instead.

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
gives 1320×2868 — already store-tier). Dirty captures clean up in-pipeline:
`--crop-bottom <px>` / `--crop-top <px>` trim, and repeatable `--mask x,y,w,h`
fills a rect (dev buttons, debug overlays) with its surrounding color. Drop
the resulting paths into the device layers' `image` fields either way.

Real captures carry their own status bar: set `showStatus: false` on those
device layers or the synthetic (iOS-styled) bar doubles it — lint flags this.

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
- For depth beyond a flat background, `shotpress decor <kind>` generates on-brand
  SVG art (aurora `mesh` background, `grain` overlay, `glow`/`blob`/`rings`/`waves`
  behind content, and `mask --image <shot> --shape circle|rounded` to clip a
  screenshot into an avatar bubble or a magnified-detail callout). It prints a
  paste-ready `bg` or image-`layer` snippet with `--json`. Pass `--accent <hex>`
  (or `--color`) to tie it to the brand, else it comes out the default purple.
  Run `shotpress decor` with no kind to list them. Use with restraint (see
  DESIGN.md "Depth and texture") — one motif, behind content, low opacity.
- `bg.pattern` overlays a subtle texture on any background: `none` | `dots` |
  `grid` | `lines`. Official Apple bezels (more premium than the synthetic frame)
  come from `shotpress frames install --accept-apple-terms`, then set a device
  layer's `frame` (e.g. `"iphone"`); they must stay un-posed and off Play sets.
- Custom display face: `render --fonts <dir>` embeds every font file in the
  directory (family = the file's base name) so `font: "'MyFont', sans-serif"`
  renders offline. The four bundled families (Space Grotesk, Manrope, Instrument
  Serif, Cairo) always work; other Google families load from the network.
- Native depth on `shape` / `icon` / `device`: `shadow` (`true` for a default
  drop shadow, or `{x,y,blur,spread,color}` / an array for custom), `glow`
  (`{blur,spread,color}` — a device glow uses a rounded drop-shadow to lift the
  phone off a dark ground), and `blur` (px) on shape/icon. A `shape` `fill` also
  takes a CSS gradient string, not just a hex. Any layer takes `blend` (CSS
  mix-blend-mode); `blend:"screen"` makes a coloured glow sit naturally on dark.
- Real 3D device: point a device layer at your own model with
  `"model3d": "iphone.glb"` (a glTF/GLB you have the rights to — shotpress ships
  none and hosts none). It renders through WebGL (environment reflections, studio
  light, grounded contact shadow) and swaps in for the flat bezel. The model is
  centred and scaled automatically; the device's `image` maps onto the mesh named
  `screen`/`display`/`glass` (override with `"screenMesh"`); `rx3d`/`ry3d` (or a
  `pose`) drive the camera angle. The rendered device only looks as good as the
  glb you feed it. Caveat: WebGL output is deterministic on one machine but not
  byte-identical across GPUs, so `model3d` renders aren't hermetic the way the
  flat renders are, and it spins up a separate render pass (slower) — use it for
  the final export, keep iterating layout on the flat board.
- Compound layers: `component:"stat"|"chip"|"avatar-stack"|"rating-row"|"feature-list"`
  on a layer expands into a positioned group (a big metric + label, a floating
  notification card, overlapping avatars, a proof row, a feature stack). Pass the
  params from `shotpress components`; tweak the expanded primitives after with
  `shotpress resolve`.
- Device layers: `kind` (phone/tablet/mac/watch), `bezel` (black/white/clay),
  `notch` (auto/island/notch/punch/none), `treatment` (plain/bleed/angled/
  compare/duo/pano/multi), and `rx3d`/`ry3d` for a 3D perspective pose.
- `bleed` fills the whole canvas with the screenshot, which means it zooms in
  and crops the screenshot's own edges (the default scale is high by design).
  Use it only for captures whose edges are safe to lose — full-bleed imagery,
  not a UI screen with text or controls near the border, which gets sliced.
  `device.accent` also paints a visible frame edge under `bleed` (it doesn't on
  plain/angled), so leave it unset there unless you want that band.
- `pano` runs one screenshot across adjacent screens: give the device layer on
  each of the consecutive screens `treatment:"pano"` with the SAME `image`, and
  the engine auto-groups them and slices the image left-to-right (screen 1 shows
  the left portion, screen 2 the next, and so on).
- Deliberately breaking a rule? Opt out per project with
  `"lint": { "allow": ["COMPOSITION_REPEAT", "COLOR_SPRAWL"] }` — a brutalist
  one-treatment set or a multi-ground palette then lints clean, and `lint --json`
  reports a `suppressed` count so nothing is hidden silently.
- Positions (`cx`/`cy`) are design-space px for the project's format (e.g.
  iPhone is a 360×780 canvas). Don't hand-convert between formats — rendering
  with `--format` reflows automatically. `lint --measure` prints each layer's
  computed line-count and bounding box (and each device's box) so you can catch
  a headline that wraps into the copy below it BEFORE rendering.

4. **Design like a system, not a template.** Read DESIGN.md in this skill
directory before rewriting copy or composition — it's the doctrine that
lifts a set well past pack defaults (narrative arc, type scale, copy
formulas, treatment schedule), and every rule is numeric.

   A project can carry a small design system so consistency isn't hand-copied
   across dozens of layers — it expands automatically for `render`/`lint`:
   - `"tokens"`: named colours (`{"accent":"#2a6fdb","ink":"#fff","muted":"rgba(255,255,255,.72)"}`).
     Reference them as `@accent` anywhere a string appears (colours, gradients, brand).
   - `"styles"`: named text presets (`{"eyebrow":{...},"headline":{...}}`); a text
     layer uses one via `"style":"eyebrow"` and its own fields still win.
   - `"decorations"`: layers drawn on every screen (define the signature motif once).
   - `"pose":"hero-left"` on a device layer expands to a tasteful `rx3d/ry3d`
     (see `shotpress pose`). One edit reskins the whole set.

   `render`/`lint`/`validate` see the expanded form. To hand-edit or `watch` a
   tokenized project, bake it first: `shotpress resolve project.json --out flat.json`.

5. **Lint, render, self-review, iterate**

```bash
npx shotpress lint project.json --sketch   # ascii map of layer positions
npx shotpress lint project.json --measure  # line-count + bbox per layer, no render
npx shotpress lint project.json --json     # numeric design critique
npx shotpress validate project.json
npx shotpress render project.json --out shots --json          # one format
```

`lint` catches text-over-text and text-over-device collisions, the type scale
(compared optically per font family, so a serif and a sans can share a px),
contrast, safe zones and composition rhythm. `--measure` is the fast pre-render
check: it reports the same computed geometry lint reasons about, so an agent can
see a headline wrapped to 3 lines without opening the PNG. Then render one
format and actually look at the PNGs — full size for promise-clarity, and
downscaled to ~120px for thumbnail legibility (screens 1–3 must read at
search-result size). `render --contact` also writes one numbered montage of the
whole set, which is how you judge rhythm across screens at a glance. Iterate
until clean, then:

```bash
npx shotpress render-all project.json --stores appstore,play --zip --json
```

`render-all` writes `<out>/<store>/<format>/screen-NN.png` — note everything
nests under the `--out` dir. `--json` prints absolute paths, so read those
rather than guessing locations.

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

9. **Watch it compose live.** When the user wants to see the set built in front
of them — the whole board updating as you work — start `npx shotpress watch
project.json` **in the background** (it serves a live board and holds until
Ctrl-C) and then do the `new` / capture / copy edits on the file as usual. It
opens the board in the user's default browser and syncs **both ways** over
loopback: every save you write appears on the board within a poll, and any layer
the user drags by hand is written back to the file. The user watches screens and
copy land in real time, tweaks anything themselves, and when happy clicks
**Export store PNGs** on the board — that runs the same headless renderer the CLI
uses (store-exact pixels, blur/3D intact), so there's no need to leave the tab.
`render-all` still works if you want the full store matrix from the terminal.
Notes: the file is the single source of truth; the board is fully self-contained
(engine runtime is served vendored, no CDN, works offline); a transient bad edit
(missing image, unknown format) is skipped with a note and it keeps watching;
`--out <dir>` sets where Export writes (default `./shotpress-out`); `--window`
uses a dedicated Chromium window instead of the default browser (CI / no
browser); `--no-open` just prints the URL (remote/SSH).

While the board is open it owns the file's on-disk format: a human drag writes
the whole file back via `JSON.stringify(…, null, 2)`. So if you keep editing the
same file alongside the board, read-modify-**write the whole file** (parse JSON,
change it, write it back), don't apply exact-string patches — a reformat from
the board would break a string match mid-session. The board only writes on a
browser-origin change and skips no-op saves, so your own edits alone don't churn
the file.

## Notes

- Browser resolution: Playwright's cached Chromium, then system Google Chrome.
  If neither exists the error names the exact install command; CI images with
  their own Chromium can pass `--browser-path`.
- Exit codes: 0 ok, 1 validation/render failure (JSON error on stderr),
  2 bad usage, 3 no browser.
- Android phone output is 1080×2160 (the design's 1:2 aspect); Play accepts it.
  All other formats come out store-exact (e.g. 1290×2796 for iPhone 6.9″).
- Templates for all 9 packs live in `templates/` as starting points.
- Fonts: four families ship vendored and render offline (Space Grotesk, Manrope,
  Instrument Serif, Cairo for Arabic). Any other Google Fonts family named in a
  text layer's `font` loads from the network at render time; there's no offline
  path for a custom `@font-face` today, so keep offline/CI renders to the
  vendored four. The default pack face is Space Grotesk — swap it if you want a
  more distinctive set.
- A short all-caps kicker, or a text layer tagged `role: "eyebrow"` (or
  `"kicker"`/`"label"`), gets a relaxed legibility floor, so a small caps label
  above a headline is allowed where body copy that size would be flagged.
- A `feature` layer's internal title/sub sizes are managed by the engine and sit
  outside the type-scale check — use feature rows for benefit lists without them
  counting against your 3-tier scale. Emoji render via a `feature.glyph` (the
  headless browser falls back to the system emoji font).
