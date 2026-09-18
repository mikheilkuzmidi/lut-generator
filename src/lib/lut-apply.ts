// LUT Apply Library
// Samples transformColor onto a grid once, then reuses that grid for every
// pixel in a preview frame instead of re-running the full color pipeline
// per pixel (that per-pixel cost is what makes live sliders feel laggy).

import type { LUTParams } from './lut-generator'
import { assertGridSize, transformColor } from './lut-generator'

// Structural stand-in for the DOM's ImageData. It deliberately omits the
// browser-only colorSpace field so this module has no canvas/DOM dependency
// and a test can build one with a plain object literal in Node.
export interface ImageData {
  data: Uint8ClampedArray
  width: number
  height: number
}

// 17 keeps buildLUT at 17^3 = 4913 samples, cheap enough to redo on every
// slider tick, while trilinear interpolation still hides the coarse grid
// from a viewer at preview resolution.
const DEFAULT_PREVIEW_SIZE = 17

// Sample the color transform once per grid point, red-major (r fastest,
// then g, then b) to match generateCubeLUT's .cube row order, so a grid
// built here and a file exported there always mean the same thing by index.
export function buildLUT(params: LUTParams, size: number): Float32Array {
  // Same reason as generateCubeLUT: size 1 makes every grid coordinate 0/0.
  // Uint8ClampedArray then coerces the resulting NaN to 0, so the failure came
  // out as a silently, plausibly black picture rather than as an error.
  assertGridSize(size)
  const transform = transformColor
  const lut = new Float32Array(size * size * size * 3)
  const denom = size - 1

  let i = 0
  for (let b = 0; b < size; b++) {
    const bIn = b / denom
    for (let g = 0; g < size; g++) {
      const gIn = g / denom
      for (let r = 0; r < size; r++) {
        const [rOut, gOut, bOut] = transform(r / denom, gIn, bIn, params)
        lut[i] = rOut
        lut[i + 1] = gOut
        lut[i + 2] = bOut
        i += 3
      }
    }
  }

  return lut
}

// Map every pixel through the grid with trilinear interpolation between the
// 8 surrounding grid points. Nearest-neighbour would snap each pixel to
// whichever grid vertex is closest, which visibly posterizes at preview
// grid sizes (e.g. 17): flat bands appear wherever two neighbouring pixels
// round to the same vertex. Interpolating removes those bands.
//
// Cost per pixel: 8 corner lookups per channel (24 Float32Array reads),
// ~24 multiply-adds to blend them, plus one alpha copy; no allocation
// happens inside the loop. Per megapixel that is roughly 24 million reads
// and 24 million multiply-adds, on the order of a few tens of milliseconds
// on typical hardware, well inside a slider-drag budget.
export function applyLUT(source: ImageData, lut: Float32Array, size: number): ImageData {
  const { data, width, height } = source
  const out = new Uint8ClampedArray(data.length)

  const maxIndex = size - 1
  const scale = maxIndex / 255
  const size2 = size * size

  for (let p = 0; p < data.length; p += 4) {
    out[p + 3] = data[p + 3] // alpha passes through untouched

    const rf = data[p] * scale
    const gf = data[p + 1] * scale
    const bf = data[p + 2] * scale

    let r0 = rf | 0
    let g0 = gf | 0
    let b0 = bf | 0
    // guard against float overshoot landing r0 past the last grid line
    if (r0 > maxIndex) r0 = maxIndex
    if (g0 > maxIndex) g0 = maxIndex
    if (b0 > maxIndex) b0 = maxIndex

    // at the top edge r1 collapses back onto r0 instead of reading past
    // the grid; the matching weight math still gives the right answer
    // because both corners are then the same sample
    const r1 = r0 < maxIndex ? r0 + 1 : r0
    const g1 = g0 < maxIndex ? g0 + 1 : g0
    const b1 = b0 < maxIndex ? b0 + 1 : b0

    const fr = rf - r0
    const fg = gf - g0
    const fb = bf - b0
    const fr1 = 1 - fr
    const fg1 = 1 - fg
    const fb1 = 1 - fb

    const b0Off = b0 * size2
    const b1Off = b1 * size2
    const g0Off = g0 * size
    const g1Off = g1 * size

    const i000 = (b0Off + g0Off + r0) * 3
    const i100 = (b0Off + g0Off + r1) * 3
    const i010 = (b0Off + g1Off + r0) * 3
    const i110 = (b0Off + g1Off + r1) * 3
    const i001 = (b1Off + g0Off + r0) * 3
    const i101 = (b1Off + g0Off + r1) * 3
    const i011 = (b1Off + g1Off + r0) * 3
    const i111 = (b1Off + g1Off + r1) * 3

    // corner weights are shared across all three channels below
    const fg1fb1 = fg1 * fb1
    const fgfb1 = fg * fb1
    const fg1fb = fg1 * fb
    const fgfb = fg * fb

    const w000 = fr1 * fg1fb1
    const w100 = fr * fg1fb1
    const w010 = fr1 * fgfb1
    const w110 = fr * fgfb1
    const w001 = fr1 * fg1fb
    const w101 = fr * fg1fb
    const w011 = fr1 * fgfb
    const w111 = fr * fgfb

    out[p] =
      (lut[i000] * w000 + lut[i100] * w100 + lut[i010] * w010 + lut[i110] * w110 +
       lut[i001] * w001 + lut[i101] * w101 + lut[i011] * w011 + lut[i111] * w111) * 255

    out[p + 1] =
      (lut[i000 + 1] * w000 + lut[i100 + 1] * w100 + lut[i010 + 1] * w010 + lut[i110 + 1] * w110 +
       lut[i001 + 1] * w001 + lut[i101 + 1] * w101 + lut[i011 + 1] * w011 + lut[i111 + 1] * w111) * 255

    out[p + 2] =
      (lut[i000 + 2] * w000 + lut[i100 + 2] * w100 + lut[i010 + 2] * w010 + lut[i110 + 2] * w110 +
       lut[i001 + 2] * w001 + lut[i101 + 2] * w101 + lut[i011 + 2] * w011 + lut[i111 + 2] * w111) * 255
  }

  return { data: out, width, height }
}

// Convenience path: build the grid, then walk the image once.
export function applyParams(
  source: ImageData,
  params: LUTParams,
  size: number = DEFAULT_PREVIEW_SIZE
): ImageData {
  const lut = buildLUT(params, size)
  return applyLUT(source, lut, size)
}
