# Restofront Fork R — design QA

Status: **Passed**

Reference: the selected Fork R favicon from the Restofront 05 concept board.

## Production assets

- `public/brand/restofront/mark.png` — 512 × 512
- `public/brand/restofront/favicon-32.png` — 32 × 32
- `public/brand/restofront/apple-touch-icon.png` — 180 × 180

The selected artwork was centre-cropped to a square and resized without
redrawing or changing its burgundy, cream, fork, R, or rounded-square treatment.

## Rendered checks

- Restofront desktop header: passed at a measured 36 × 36 CSS pixels.
- Restofront mobile header: passed at 390 × 844 with no horizontal overflow.
- Cornershopdev storefront card: passed at a measured 36 × 36 CSS pixels.
- Browser metadata: passed with the Restofront 32 × 32 favicon and 180 × 180
  Apple touch icon present alongside the route title.
- Salonfront visibility: passed; the unpublished vertical does not render on the
  factory homepage.

## Verification

- 86 tests passed.
- ESLint completed with no errors; the only warning is the pre-existing
  generated workflow route warning.
- Next's webpack build compiled the application and completed TypeScript, then
  stopped while collecting the existing workflow webhook route because its
  runtime path configuration is absent locally.
- Next's default Turbopack build was stopped after it stalled without output.
