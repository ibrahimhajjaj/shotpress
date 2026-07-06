# Layer catalogue

authoritative layer schema read from the engine. cx/cy are design-space px for the format; scale/rot/opacity apply to every layer.

Generated from the engine by `npx shotpress schema --markdown`. `shotpress schema --json` gives the machine-readable form.

## Every layer carries these

| field | type | default |
|---|---|---|
| `type` | device \| text \| rating \| callout \| badge \| logo \| image \| shape \| icon \| feature |  |
| `cx` | number |  |
| `cy` | number |  |
| `scale` | number | 1 |
| `rot` | number | 0 |
| `opacity` | number | 1 |
| `hidden` | boolean | false |

## Background — `screen.bg`

| field | type | default |
|---|---|---|
| `type` | solid \| gradient \| image |  |
| `value` | string |  — CSS colour or gradient (solid/gradient) |
| `image` | string|null |  — path or data URL (image type) |
| `pattern` | none \| dots \| grid \| lines | "none" |

## `device`

| field | type | default |
|---|---|---|
| `scale` | number | 0.709090909090909 |
| `rot` | number | 0 |
| `kind` | phone \| tablet \| mac \| watch | "phone" |
| `os` | ios \| android \| mac \| watch | "ios" |
| `orientation` | string | "portrait" |
| `showStatus` | boolean | false |
| `statusDark` | boolean | false |
| `image` | string|null | null |
| `beforeImage` | string|null | null |
| `treatment` | plain \| bleed \| angled \| compare \| duo \| pano \| multi | "plain" |
| `bezel` | string | "black" |
| `showVideo` | boolean | false |
| `accent` | string | "#ffffff" |
| `rx3d` | number | 0 |
| `ry3d` | number | 0 |

## `text`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `text` | string | "Double-click to edit" |
| `font` | string | "'Space Grotesk', sans-serif" |
| `fontSize` | number | 25 |
| `weight` | number | 700 |
| `color` | string | "#ffffff" |
| `align` | string | "center" |
| `width` | number | 252 |
| `lineHeight` | number | 1.1 |
| `accent` | string | "#6d5cf5" |
| `scrim` | string | "none" |

## `rating`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `stars` | number | 5 |
| `value` | string | "4.9 · 12k ratings" |
| `showValue` | boolean | true |
| `color` | string | "#ffc53d" |
| `textColor` | string | "#ffffff" |

## `callout`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `text` | string | "Tap to track" |
| `arrow` | string | "down" |
| `cstyle` | string | "accent" |
| `accent` | string | "#6d5cf5" |

## `badge`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `variant` | string | "pill" |
| `text` | string | "Editor’s Choice" |
| `appName` | string | "Your App" |

## `logo`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `src` | string|null | null |
| `radius` | number | 14 |
| `fit` | string | "contain" |
| `shadow` | boolean | false |
| `isLogo` | boolean | true |
| `w0` | number | 120 |

## `image`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `src` | string|null | null |
| `radius` | number | 16 |
| `fit` | string | "cover" |
| `shadow` | boolean | true |
| `w0` | number | 160 |

## `shape`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `shape` | string | "rect" |
| `fill` | string | "#6d5cf5" |
| `stroke` | boolean | false |
| `strokeColor` | string | "#ffffff" |
| `strokeW` | number | 2 |
| `radius` | number | 18 |
| `w0` | number | 140 |
| `h0` | number | 140 |

## `icon`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `glyph` | string | "✓" |
| `color` | string | "#ffffff" |
| `iconBg` | string | "#6d5cf5" |
| `bgShape` | string | "circle" |
| `size` | number | 46 |

## `feature`

| field | type | default |
|---|---|---|
| `scale` | number | 1 |
| `rot` | number | 0 |
| `glyph` | string | "✦" |
| `title` | string | "Lightning fast" |
| `sub` | string | "Built for speed" |
| `iconColor` | string | "#ffffff" |
| `iconBg` | string | "#6d5cf5" |
| `bgShape` | string | "round" |
| `titleColor` | string | "#ffffff" |
| `subColor` | string | "rgba(255,255,255,.72)" |
| `font` | string | "'Manrope', sans-serif" |
| `w0` | number | 266 |

## Add-keyword aliases

- `heading` — a `text` preset (differs in size/shape defaults)
- `circle` — a `shape` preset (differs in size/shape defaults)
- `line` — a `shape` preset (differs in size/shape defaults)
