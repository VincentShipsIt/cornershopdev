---
version: "alpha"
name: Cornershopdev
description: Friendly factory identity built from a folded storefront tile and a clear C.
colors:
  primary: "#0D4A39"
  on-primary: "#F7F1E7"
  accent: "#F15A3D"
  background: "#F7F1E7"
  foreground: "#1F2622"
  muted: "#646863"
  border: "#D7D2C8"
  on-dark: "#FFFFFF"
typography:
  display:
    fontFamily: Instrument Serif
    fontSize: 64px
    fontWeight: 400
    lineHeight: 0.94
    letterSpacing: -0.04em
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.7
  label-caps:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.16em
rounded:
  sm: 8px
  md: 14px
  lg: 24px
  xl: 32px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  brand-mark:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
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
    textColor: "{colors.foreground}"
  surface-default:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  body-copy-muted:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
  surface-dark:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-dark}"
  divider:
    backgroundColor: "{colors.border}"
    textColor: "{colors.foreground}"
---

## Overview

Cornershopdev is the factory behind many focused storefront products. Its mark
combines a folded page, a small shop awning and a direct C. The result should
feel useful, modular and human—not like infrastructure software or a generic
shopping app.

## Colors

- **Factory green (`#0D4A39`):** the structural tile, primary controls and dark
  brand surfaces.
- **Coral (`#F15A3D`):** the three awning tabs and small, deliberate accents.
- **Warm cream (`#F7F1E7`):** the C, page background and breathing room.
- **Foreground (`#1F2622`):** near-black green for text.
- **Muted (`#646863`):** supporting copy with AA contrast on cream.

The three logo colors are exact flat sRGB values. Do not sample softened colors
from the generated concept board.

## Typography

Instrument Serif carries large factory statements. Geist handles navigation,
body copy, controls and technical explanations. Geist Mono is reserved for
commands, schemas and implementation details.

## Layout

Use generous cream space and a 32px grid. The factory explains a system, so
layouts should make hierarchy and relationships obvious without looking like an
enterprise architecture diagram.

## Elevation & Depth

Use borders and tonal contrast before shadows. The logo is always flat: no
lighting, gradients, bevels, grain or mockup texture.

## Shapes

The mark uses one clipped page tile, exactly three awning tabs and one C. Keep
the 45-degree lower-right fold and equal transparent canvas padding. Do not add
windows, doors, carts, bags, gears or extra modular blocks.

## Components

- **Brand mark:** `public/brand/cornershopdev/logo-square.png` is the 1024 ×
  1024 transparent RGBA master.
- **Header mark:** use the 512px derivative; render it at 36px.
- **Browser chrome:** use the dedicated 32px favicon and 180px Apple touch icon.
- **Primary button:** factory green with cream text.
- **Accent:** coral is supporting color, never the dominant page fill.

## Do's and Don'ts

- Do preserve the folded lower-right corner and three-tab awning.
- Do keep the C readable at 16px.
- Do use the exact factory green, coral and cream values.
- Do keep every raster export square with a transparent exterior.
- Don't add gradients, texture, highlights, shadows or an enclosing app tile.
- Don't turn the mark into a generic shopping bag or SaaS cube.
- Don't use the Cornershopdev identity on a niche storefront.
