---
version: "alpha"
name: Restofront
description: Classy editorial hospitality identity built around the Fork R mark.
colors:
  primary: "#7F2020"
  on-primary: "#F7F1E7"
  background: "#F7F1E7"
  foreground: "#211813"
  muted: "#746760"
  border: "#D9CBBE"
  dark-surface: "#1D241F"
  on-dark: "#FFFFFF"
typography:
  display:
    fontFamily: Instrument Serif
    fontSize: 64px
    fontWeight: 400
    lineHeight: 0.92
    letterSpacing: -0.045em
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.75
  label-caps:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1
    letterSpacing: 0.18em
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
  surface-default:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
  body-copy-muted:
    backgroundColor: "{colors.background}"
    textColor: "{colors.muted}"
    typography: "{typography.body-md}"
  surface-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.on-dark}"
  divider-on-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.border}"
---

## Overview

Restofront should feel like a well-run dining room: composed, warm, legible and
quietly premium. The identity combines editorial serif typography with a single
unmistakable restaurant cue—the fork cut into the Restofront R.

## Colors

- **Primary (`#7F2020`):** Restofront burgundy. This exact flat sRGB value owns
  the logo tile, primary calls to action and small brand accents.
- **On primary / background (`#F7F1E7`):** Warm cream used inside the mark and
  across the paper-like page surface.
- **Foreground (`#211813`):** Espresso-black for editorial headlines and body
  copy; avoid pure black.
- **Muted (`#746760`):** Supporting copy and metadata.
- **Border (`#D9CBBE`):** Quiet warm dividers that do not compete with the mark.
- **Dark surface (`#1D241F`):** Deep green-black for high-contrast feature
  sections.

Do not substitute a brighter scarlet, orange-red or generic Tailwind red for
Restofront burgundy.

## Typography

Instrument Serif carries display headlines and the R letterform. Geist handles
navigation, body copy, controls and compact uppercase labels. Display type can
be dramatic; functional copy must remain plain and highly legible.

## Layout

Use a 32px paper grid for large marketing surfaces and generous 24–48px section
spacing. Keep the conversion path visually direct: one headline, one compact
explanation and one dominant action. Mobile layouts must not overflow at 390px.

## Elevation & Depth

Prefer borders and tonal separation over heavy shadows. Shadows are reserved for
the restaurant transformation mockup and should remain soft, broad and warm.
The brand mark itself is always flat.

## Shapes

Cards use restrained rounded corners. Pills are appropriate only for badges and
small status labels. The logo master is always a true 1:1 square PNG; the
burgundy tile stays optically centered with equal transparent padding on all
four sides.

## Components

- **Brand mark:** use `public/brand/restofront/logo-square.png` as the 1024 ×
  1024 RGBA master. The canvas outside the burgundy tile is transparent. Derive
  smaller raster exports from it without stretching, non-square cropping, color
  adjustment or effects.
- **Primary button:** burgundy background, cream text, 44px height.
- **Cards:** warm cream surface, quiet border, 24–32px corner radius.
- **Dark sections:** green-black surface with white text and burgundy/terracotta
  accents used sparingly.

## Do's and Don'ts

- Do keep the fork and R readable at 32px.
- Do use the exact `#7F2020` burgundy for every flat brand application.
- Do preserve the transparent square logo master and generate transparent square
  favicon exports.
- Don't add gradients, bevels, shadows, textures or mockup lighting to the mark.
- Don't place a cream or white rectangle behind the burgundy tile.
- Don't add a knife, plate, cloche, chef hat or a second restaurant symbol.
- Don't expose unlaunched verticals on the factory homepage.
