---
version: "beta"
name: Cornershopdev
description: Dark technical factory identity built around a folded storefront tile and a clear C.
colors:
  primary: "#F7F7F4"
  on-primary: "#050505"
  accent: "#FF775F"
  signal: "#74D7A4"
  background: "#050505"
  surface: "#090909"
  foreground: "#F7F7F4"
  muted: "#929292"
  border: "#262626"
typography:
  display:
    fontFamily: Geist
    fontSize: 72px
    fontWeight: 600
    lineHeight: 0.88
    letterSpacing: -0.065em
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
  data-label:
    fontFamily: Geist Mono
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 0.12em
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  brand-mark:
    backgroundColor: "#0D4A39"
    textColor: "#F7F1E7"
    rounded: "{rounded.lg}"
    size: 36px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    height: 44px
  accent-detail:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-primary}"
  status-live:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.on-primary}"
  surface-default:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  surface-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
  body-copy-muted:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
  divider:
    backgroundColor: "{colors.border}"
    textColor: "{colors.foreground}"
---

## Overview

Cornershopdev is the technical factory behind focused storefront products. Its
public site should look like the system it describes: precise, modular,
inspectable and fast. Near-black surfaces, crisp sans typography, restrained
data labels, and architecture motifs separate the factory from the warmer,
industry-specific brands it powers.

The identity is inspired by the clarity of modern developer tooling, not by any
single product composition. It must remain original and should never reproduce a
third party's copy, assets, component geometry or distinctive page structure.

## Colors

- **Factory black (`#050505`):** the default Cornershopdev marketing surface.
- **Panel black (`#090909`):** subtle separation for system panels and cards.
- **Foreground (`#F7F7F4`):** warm-white primary type and primary controls.
- **Muted (`#929292`):** supporting copy with WCAG AA contrast on factory black.
- **Border (`#262626`):** quiet dividers and technical grid lines.
- **Coral (`#FF775F`):** brand accent for commands, labels and directional cues.
- **Signal green (`#74D7A4`):** operational status only: live, ready or healthy.

The existing logo keeps its exact factory green (`#0D4A39`), coral
(`#F15A3D`) and cream (`#F7F1E7`). The brighter page accents are interface
tokens chosen for contrast on black; they do not modify the raster mark.

## Typography

Geist carries display headlines, navigation, body copy, and controls. Large
headlines are compact, sans-serif, and tightly tracked. Instrument Serif belongs
to hospitality and other editorial niche identities; do not use it on the
Cornershopdev factory homepage.

Geist Mono labels commands, paths, statuses, registry counts, versions and
pipeline stages. It should clarify real system structure, not decorate every
sentence.

## Layout

Use strong horizontal boundaries, a 48px technical grid for major factory
surfaces, and asymmetric editorial-to-system compositions. Sections should make
the relationship between source, vertical schema, theme and published site
immediately legible.

The mobile layout must preserve the hierarchy at 390px without horizontal
overflow. System diagrams may stack, but their labels and directional flow must
remain understandable.

## Elevation & Depth

Prefer borders, black-on-black tonal separation and restrained grid lines.
Technical panels may use one broad dark shadow to separate them from the page.
Ambient coral or green light may appear at very low opacity behind a hero
diagram; it must never reduce text contrast or resemble glossy product chrome.

## Motion

Motion communicates state. A cursor blink or slow system scan is acceptable;
continuous decorative movement is not. Every animation must stop under
`prefers-reduced-motion`.

## Shapes

Factory interface cards use tighter corners than the niche storefronts. Data
panels and architecture modules are usually rectangular. Pills are reserved for
compact status lines.

The mark itself still uses one clipped page tile, exactly three awning tabs and
one C. Keep the 45-degree lower-right fold and equal transparent canvas padding.
Do not add windows, doors, carts, bags, gears or extra modular blocks.

## Components

- **Brand mark:** `public/brand/cornershopdev/logo-square.png` is the 1024 × 1024
  transparent RGBA master.
- **Header mark:** use the 512px derivative; render it at 36px.
- **Browser chrome:** use the dedicated 32px favicon and 180px Apple touch icon.
- **Primary button:** warm-white background, factory-black text, 44px height.
- **System panel:** black tonal surface, one-pixel border, mono data labels.
- **Status:** signal green means a real operational state, never a generic accent.
- **Grid:** one-pixel low-opacity lines at 48px; denser 24px lines may support a
  bounded module section.

## Scope

This dark technical system belongs to `cornershop.dev` marketing surfaces only.
It must not globally retheme:

- Restofrontapp or any other niche marketing site.
- Restaurant theme previews or generated customer websites.
- Customer workspaces, claim screens, operator tools or authentication screens.
- Brand marks and browser assets owned by a niche.

Opt-in variants on shared components must preserve their existing default
appearance.

## Do's and Don'ts

- Do make the factory/niche distinction obvious at first glance.
- Do expose real registry, theme-library and pipeline concepts.
- Do keep primary and supporting copy at WCAG AA contrast on black.
- Do route visitors clearly to live niche products, themes and source.
- Do preserve the folded lower-right corner and three-tab awning.
- Do keep every raster export square with a transparent exterior.
- Don't use the warm paper grid, editorial serif scale or hospitality palette.
- Don't fake command output, customer counts, uptime or deployment activity.
- Don't copy third-party code, wording, assets or recognizable compositions.
- Don't use the Cornershopdev identity on a niche storefront or generated site.
