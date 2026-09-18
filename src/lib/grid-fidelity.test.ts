import { describe, expect, it } from 'vitest'
import { parseCube, sampleCube } from './cube-parse'
import { applyLUT, buildLUT } from './lut-apply'
import {
  defaultParams,
  generateCubeLUT,
  presets,
  transformColor,
  type LUTParams,
} from './lut-generator'

// The invariant nothing was testing, and the one that matters most: a LUT is a
// grid, so it can only carry a curve that is smooth relative to its spacing.
// Ask it for something steeper and the file silently stops being the grade that
// was requested. That is not a rounding error, it is the wrong picture.
//
// This caught a real one. applyContrast used a factor of (1 + c) / (1 - c*0.99),
// which is 200 at c = 1: a step at 0.5 with a transition band 0.0025 wide,
// against a grid spacing of 0.031 at size 33. A pixel that should have been
// crushed to black came back at 87 out of 255 through the exported file and 107
// through the preview. Capping the factor at 4 puts eight grid points across
// the transition instead of none.

const EXPORT_SIZE = 33 // what page.tsx always asks generateCubeLUT for
const PREVIEW_SIZE = 17 // lut-apply's DEFAULT_PREVIEW_SIZE

/** Worst absolute channel error, in 0..255 levels, over a coarse colour cube. */
function worstError(params: LUTParams, steps = 16) {
  const lut = buildLUT(params, PREVIEW_SIZE)
  const parsed = parseCube(generateCubeLUT(params, 'fidelity', EXPORT_SIZE))
  if (!parsed.ok) throw new Error(`generated cube did not parse: ${parsed.error}`)

  let preview = 0
  let file = 0
  for (let r = 0; r <= steps; r++) {
    for (let g = 0; g <= steps; g++) {
      for (let b = 0; b <= steps; b++) {
        const R = r / steps
        const G = g / steps
        const B = b / steps
        const truth = transformColor(R, G, B, params).map((v) => v * 255)

        const source = {
          data: new Uint8ClampedArray([
            Math.round(R * 255),
            Math.round(G * 255),
            Math.round(B * 255),
            255,
          ]),
          width: 1,
          height: 1,
        }
        const shown = applyLUT(source, lut, PREVIEW_SIZE).data
        const written = sampleCube(parsed.data, EXPORT_SIZE, R, G, B).map((v) => v * 255)

        for (let c = 0; c < 3; c++) {
          preview = Math.max(preview, Math.abs(shown[c] - truth[c]))
          file = Math.max(file, Math.abs(written[c] - truth[c]))
        }
      }
    }
  }
  return { preview, file }
}

const SCALARS = [
  'contrast',
  'saturation',
  'temperature',
  'tint',
  'shadows',
  'highlights',
] as const
const WHEELS = ['lift', 'gamma', 'gain'] as const

describe('the exported file is the grade that was asked for', () => {
  it.each(Object.keys(presets))('preset %s survives the grid', (name) => {
    const { preview, file } = worstError(presets[name])
    // Both well inside a level a viewer could notice on a photograph.
    expect(file).toBeLessThan(6)
    expect(preview).toBeLessThan(10)
  })

  it.each(SCALARS.flatMap((f) => [
    [f, 1] as const,
    [f, -1] as const,
  ]))('%s at %d survives the grid', (field, value) => {
    const { preview, file } = worstError({ ...defaultParams, [field]: value })
    expect(file).toBeLessThan(6)
    expect(preview).toBeLessThan(10)
  })

  it.each(WHEELS.flatMap((f) => [
    [f, 1] as const,
    [f, -1] as const,
  ]))('%s at %d on every channel survives the grid', (field, value) => {
    const { preview, file } = worstError({
      ...defaultParams,
      [field]: { r: value, g: value, b: value },
    })
    expect(file).toBeLessThan(6)
    expect(preview).toBeLessThan(10)
  })

  it('contrast at the slider maximum is representable', () => {
    // The specific regression. Before the cap this was 87 out of 255 wrong in
    // the file and 107 wrong in the preview, on this exact pixel.
    const params = { ...defaultParams, contrast: 1 }
    const truth = transformColor(125 / 255, 0, 0, params)[0] * 255

    const lut = buildLUT(params, PREVIEW_SIZE)
    const source = {
      data: new Uint8ClampedArray([125, 0, 0, 255]),
      width: 1,
      height: 1,
    }
    const shown = applyLUT(source, lut, PREVIEW_SIZE).data[0]

    const parsed = parseCube(generateCubeLUT(params, 'contrast max', EXPORT_SIZE))
    if (!parsed.ok) throw new Error('did not parse')
    const written = sampleCube(parsed.data, EXPORT_SIZE, 125 / 255, 0, 0)[0] * 255

    expect(Math.abs(shown - truth)).toBeLessThan(3)
    expect(Math.abs(written - truth)).toBeLessThan(3)
  })

  it('all nine fields at once is the only case the grid cannot hold, and it is bounded', () => {
    // Honest about the limit rather than pretending there is none. Every field
    // at +1 simultaneously stacks several steep curves, and the grid gives up
    // some accuracy. It is bounded and it is a setting that clips to nonsense
    // anyway, but the number is asserted so a regression cannot widen it
    // quietly.
    const extreme: LUTParams = {
      contrast: 1,
      saturation: 1,
      temperature: 1,
      tint: 1,
      shadows: 1,
      highlights: 1,
      lift: { r: 1, g: 1, b: 1 },
      gamma: { r: 1, g: 1, b: 1 },
      gain: { r: 1, g: 1, b: 1 },
    }
    const { file } = worstError(extreme, 12)
    expect(file).toBeLessThan(25)
  })
})

describe('a grid needs at least two points per axis', () => {
  it('rejects a size below 2 rather than writing NaN', () => {
    // Size 1 made every coordinate 0/(size-1) = 0/0. generateCubeLUT wrote the
    // literal text "NaN NaN NaN", and buildLUT's NaN was coerced to 0 by
    // Uint8ClampedArray, so the preview showed a plausible solid black instead
    // of an error.
    expect(() => generateCubeLUT(defaultParams, 't', 1)).toThrow(RangeError)
    expect(() => generateCubeLUT(defaultParams, 't', 0)).toThrow(RangeError)
    expect(() => generateCubeLUT(defaultParams, 't', -5)).toThrow(RangeError)
    expect(() => generateCubeLUT(defaultParams, 't', 2.5)).toThrow(RangeError)
    expect(() => buildLUT(defaultParams, 1)).toThrow(RangeError)
  })

  it('accepts the smallest grid that has spacing', () => {
    const cube = generateCubeLUT(defaultParams, 't', 2)
    expect(cube).not.toContain('NaN')
    const parsed = parseCube(cube)
    expect(parsed.ok).toBe(true)
  })
})
