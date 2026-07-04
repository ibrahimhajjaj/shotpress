---
description: Generate a store screenshot set for this app
argument-hint: [pack] [app name]
---

Build an App Store / Google Play screenshot set for the current project using
the shotpress skill.

Arguments (optional): $ARGUMENTS — first word is a pack id, the rest is the app
name. Discover valid packs with `npx shotpress packs`.

Steps:

1. Work out the app's name, accent color and category from the repo (app config,
   manifest, theme files). Ask only if genuinely ambiguous.
2. Get real app screenshots: use ones in the repo, or if the app runs locally,
   `npx shotpress capture <url> --routes ...` shoots it at
   device-correct viewports. Otherwise ask for a folder.
3. Scaffold with `npx shotpress new` using the best-matching
   pack, then rewrite it with the DESIGN.md rules: narrative arc
   across screens, benefit-led headlines, one type scale, social proof in
   screens 1-2.
4. Drop the real screenshot paths into the device layers' `image` fields.
5. `npx shotpress lint project.json` and fix findings, then
   `validate`, then render one format and review the PNGs yourself — full size
   and at thumbnail width (screens 1-3 must stay legible at ~120px).
6. When clean: `npx shotpress render-all --stores appstore,play --zip --json`.
7. Show the user the output folder and the first rendered screen.
