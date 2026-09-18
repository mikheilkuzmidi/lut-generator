import { describe, expect, it } from 'vitest'
import {
  defaultParams,
  generateCubeLUT,
  transformColor,
} from './lut-generator'

// Data rows are exactly three floats separated by single spaces (e.g. "0.500000 1.000000 0.000000").
// Header/comment/blank lines never match this, so filtering on it isolates the LUT body.
const DATA_ROW = /^(-?\d+\.\d+) (-?\d+\.\d+) (-?\d+\.\d+)$/

function parseDataRows(cube: string): [number, number, number][] {
  return cube
    .split('\n')
    .map(line => DATA_ROW.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(m => [Number(m[1]), Number(m[2]), Number(m[3])])
}

describe('generateCubeLUT', () => {
  it('writes a LUT_3D_SIZE header matching the requested size', () => {
    const cube = generateCubeLUT(defaultParams, 'My LUT', 17)

    expect(cube).toContain('TITLE "My LUT"')
    expect(cube).toContain('LUT_3D_SIZE 17')
    expect(cube).toContain('DOMAIN_MIN 0.0 0.0 0.0')
    expect(cube).toContain('DOMAIN_MAX 1.0 1.0 1.0')
  })

  it('emits exactly size^3 data rows', () => {
    for (const size of [2, 3, 5]) {
      const cube = generateCubeLUT(defaultParams, 'Size Test', size)
      expect(parseDataRows(cube)).toHaveLength(size ** 3)
    }
  })

  it('keeps every output value within the 0..1 domain', () => {
    // A saturation of -1 and heavy lift/gamma/gain still has to come out
    // clamped, since every stage in transformColor clamps its result.
    const stressParams = {
      ...defaultParams,
      contrast: 1,
      saturation: -1,
      temperature: 1,
      tint: -1,
      shadows: 1,
      highlights: -1,
      lift: { r: 1, g: -1, b: 1 },
      gamma: { r: -1, g: 1, b: -1 },
      gain: { r: 1, g: -1, b: 1 },
    }

    {
      const cube = generateCubeLUT(stressParams, 'Stress Test', 5)
      for (const [r, g, b] of parseDataRows(cube)) {
        expect(r).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThanOrEqual(1)
        expect(g).toBeGreaterThanOrEqual(0)
        expect(g).toBeLessThanOrEqual(1)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThanOrEqual(1)
      }
    }
  })

  it('orders data red-major (red fastest, then green, then blue)', () => {
    // With defaultParams, transformColor is the identity, so each row's
    // output triple is just the loop indices (r, g, b) rescaled to 0..1.
    // That lets the row order be checked exactly instead of just by shape.
    const size = 3
    const cube = generateCubeLUT(defaultParams, 'Order Test', size)
    const rows = parseDataRows(cube)

    const expected: [number, number, number][] = []
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          expected.push([r / (size - 1), g / (size - 1), b / (size - 1)])
        }
      }
    }

    expect(rows).toHaveLength(expected.length)
    for (let i = 0; i < expected.length; i++) {
      expect(rows[i][0]).toBeCloseTo(expected[i][0], 5)
      expect(rows[i][1]).toBeCloseTo(expected[i][1], 5)
      expect(rows[i][2]).toBeCloseTo(expected[i][2], 5)
    }
  })

})

describe('transformColor', () => {
  it('is the identity transform when all params are zero', () => {
    const samples: [number, number, number][] = [
      [0, 0, 0],
      [1, 1, 1],
      [0.25, 0.5, 0.75],
      [0.1, 0.9, 0.4],
    ]

    for (const [r, g, b] of samples) {
      const [rOut, gOut, bOut] = transformColor(r, g, b, defaultParams)
      expect(rOut).toBeCloseTo(r, 9)
      expect(gOut).toBeCloseTo(g, 9)
      expect(bOut).toBeCloseTo(b, 9)
    }
  })
})
