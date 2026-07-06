# Design doctrine — composing sets that beat template output

The packs are scaffolding, not the ceiling. A pack gives you 10 valid screens;
this document is how you rewrite them into a listing that outsells the default. Every rule here is
checkable from the JSON — `shotpress lint` enforces most of them mechanically.

## Narrative arc (10 screens)

Store visitors see screens 1–3 in the search result before they ever open the
listing. Treat those three as one billboard:

1. **Screen 1 — the hook.** Core value prop in the set's largest type
   (hero tier, weight 700), 2–5 words, outcome-led. One device, `plain`,
   scale 0.9–1.0. No feature names, no jargon.
2. **Screen 2 — proof or problem.** A `rating` or `badge` layer goes in screen
   1 or 2, always. Composition shifts (angled pair, duo, or 3D pose) so the
   triptych doesn't read as three copies.
3. **Screen 3 — hero feature.** The single feature users install for.
4. **Screens 4–8 — one idea per screen.** Locked headline anchor (same `cy`
   across these screens), device at a consistent scale, treatment varied on a
   schedule — never the same treatment+pose more than two screens running.
   Use `bleed` + `scrim` when the app UI itself is the story, `compare` for
   before/after, `duo` for phone+desktop, `pano` to run one flow across
   adjacent screens.
5. **Screen 9 — social proof reprise.** Ratings, badges, or a quote-style
   text layer; drop device scale to ~0.85 to give proof the space.
6. **Screen 10 — the closer.** No device or a minimal one; a serif or
   display-face CTA line centered around the upper third.

## Type scale

Exactly three tiers, zero variance inside a tier (design px on a 360-wide
canvas; scale proportionally for other formats):

- **Hero** 44–56 — screen 1 and screen 10 only.
- **Headline** 26–34 — one per feature screen.
- **Body/subhead** 16–18 — never below 17 on formats with real-scale < 3.6;
  the floor is 60 real pixels.

If you find yourself typing a fourth size, you're adding noise, not hierarchy.

## Copy formulas

- Headline: 2–6 words, verb- or outcome-led ("Split bills in seconds", not
  "Advanced Payment Splitting"). At least 70% of headlines across the set are
  benefits; feature names belong on screens 4+.
- Subhead: one sentence, ≤14 words, muted color (`rgba(255,255,255,.7)` on
  dark).
- Exactly one emphasized span per headline: `*accent*`, `**chip**`, or
  `~gradient~`. Zero markup reads flat; two reads busy.
- Numbers beat adjectives: "4.9 ★ · 12k ratings", "2M users", "under 3 seconds".

## Color

- One accent. It appears in the `*markup*`, the brand accent, and at most one
  shape/icon per screen. Non-neutral text colors across the whole set: ≤3.
- Backgrounds stay in one family — ramp lightness or hue gradually across the
  set (screen 1 darkest → screen 10 resolves), never switch families mid-set.
- Text-on-background contrast ≥4.5:1 wherever there's no scrim. Gradients:
  check against the lightest stop behind the text.

## Depth and texture (restraint first)

Whitespace is an asset, not a gap to fill. A flat background with one soft light
source and a hint of grain reads more premium than a canvas busy with shapes.
The failure mode is decoration for its own sake — that's the generic-template
look. So: at most one background motif per set, always behind the content, low
contrast, on-brand.

Two ways to add depth, both rendered by the real browser at export:

- **CSS in `bg.value`** for soft, cheap depth: a `radial-gradient` glow, layered
  radials for an orb, a mesh of colour stops. Reach here first.
- **Native layer depth** for solid shapes and the device: a `shape`/`icon`/`device`
  takes `shadow`, `glow` (a coloured halo — a `device.glow` lifts the phone off a
  dark ground), and `blur`; a `shape.fill` takes a gradient; any layer takes
  `blend` (use `"screen"` so a glow reads as light). Reach here for lit cards,
  orbs, and the device halo.
- **`shotpress decor <kind>`** when you need organic edges CSS can't do — an
  aurora `mesh` background, `grain`/noise overlay, a soft `glow` behind the
  device, a `blob`, `rings`, or `waves`. It emits a self-contained SVG (blur,
  gradient fill, and grain baked in) plus a paste-ready `bg` or image-`layer`
  snippet. `--seed` keeps a whole set on one visual family; `--color` ties it to
  the accent. Run `shotpress decor` with no kind to see them.

Keep decoration under the headline and behind the device, never over text, and
low enough in opacity that it's felt, not read. A little `grain` over a flat
dark ground is the single highest-signal move; a full-canvas `mesh` replaces a
flat background with soft colour fields. Don't stack more than one or two.

## Layout numbers (360×780 canvas — scale for others)

- Side margins: nothing within 16px of the edges; text `width` ≤312.
- Store-UI overlap: keep critical text out of the top 6% and bottom 4%.
- Single device: scale 0.85–1.05, centered, top edge below the headline band.
- Text never overlaps a device frame without `scrim` set.
- Max 3 text layers + 2 devices per screen.

## Category conventions

Finance/privacy: dark, restrained, proof-forward. Fitness/food: bright,
saturated, energy in the poses. AI: gradient glow, generous negative space.
Productivity/SaaS: light or mid backgrounds, UI legibility first. Match the
pack's `bezel` to the background (white bezel on light sets).

## The loop — design like a system, review like a human

1. Scaffold from the closest pack, then rewrite every headline for the actual
   app. Delete screens that don't earn their slot; 6 strong beats 10 filler.
2. `shotpress lint project.json` — fix every finding or justify it explicitly.
3. Render one format, then LOOK at the output. Two passes:
   - Full size: is the first screen's promise instant? Does anything collide?
   - Thumbnail: downscale screen 1–3 to ~120px wide (`sips -Z 120` or read the
     render small). If you can't read the headline at thumbnail size, neither
     can a store visitor scrolling search results.
4. Iterate JSON → lint → render until both passes hold, then `render-all`.
5. Variants are free for you: emit a second project.json with an alternate
   screen-1 hook for A/B (custom product pages), or a dark-mode set by
   swapping backgrounds and `statusDark` — offer both when the user cares.
