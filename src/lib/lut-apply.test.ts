import { describe, expect, it } from 'vitest'
import { applyLUT, applyParams, buildLUT } from './lut-apply'
import { defaultParams, presets, transformColor } from './lut-generator'

describe('applyParams identity', () => {
  it('matches the input within 1-2 levels when all params are zero', () => {
    // Trilinear interpolation of an identity grid is exact in the real
    // numbers (lerping a linear function reconstructs it exactly), so the
    // only error left comes from two roundings: mapping the 8-bit pixel
    // into grid space, and rounding the interpolated float back into a
    // Uint8ClampedArray. Each rounding is at most half a level.
    const width = 4
    const height = 1
    const data = new Uint8ClampedArray([
      0, 0, 0, 255,
      64, 128, 192, 128,
      255, 255, 255, 0,
      10, 200, 50, 64,
    ])
    const source = { data, width, height }

    const result = applyParams(source, defaultParams, 17)

    for (let i = 0; i < data.length; i++) {
      expect(Math.abs(result.data[i] - data[i])).toBeLessThanOrEqual(2)
    }
  })
})

describe('applyLUT trilinear interpolation', () => {
  it('lands strictly between the two neighbouring grid samples, not snapped to one', () => {
    const size = 9 // denom 8, so grid lines sit at multiples of 1/8
    const params = { ...defaultParams, contrast: 0.6 } // steep enough that neighbouring samples clearly differ
    const lut = buildLUT(params, size)

    // green/blue pinned to 0 so their fractional weight is exactly zero,
    // isolating the interpolation to the red axis alone
    const redByte = 145 // falls strictly inside grid cell [4, 5] of 8, not on a line
    const source = { data: new Uint8ClampedArray([redByte, 0, 0, 255]), width: 1, height: 1 }

    const result = applyLUT(source, lut, size)

    const denom = size - 1
    const rf = redByte * (denom / 255)
    const r0 = Math.floor(rf)
    const r1 = r0 + 1
    expect(r0).toBeGreaterThan(0) // confirm this is an interior cell, not an edge
    expect(r1).toBeLessThan(denom)

    const lowSample = transformColor(r0 / denom, 0, 0, params)[0] * 255
    const highSample = transformColor(r1 / denom, 0, 0, params)[0] * 255
    const lo = Math.min(lowSample, highSample)
    const hi = Math.max(lowSample, highSample)

    expect(lo).toBeLessThan(hi) // sanity: the two grid samples actually differ
    expect(result.data[0]).toBeGreaterThan(lo)
    expect(result.data[0]).toBeLessThan(hi)
  })
})

describe('preset direction', () => {
  it('warm-golden raises red relative to blue for a neutral input', () => {
    const source = { data: new Uint8ClampedArray([128, 128, 128, 255]), width: 1, height: 1 }

    const result = applyParams(source, presets['warm-golden'], 17)

    expect(result.data[0]).toBeGreaterThan(result.data[2])
  })
})

describe('alpha channel', () => {
  it('passes every alpha value through unchanged', () => {
    const data = new Uint8ClampedArray([
      10, 20, 30, 0,
      40, 50, 60, 64,
      70, 80, 90, 128,
      100, 110, 120, 255,
    ])
    const source = { data, width: 4, height: 1 }

    const result = applyParams(source, presets['high-contrast'], 17)

    expect(result.data[3]).toBe(0)
    expect(result.data[7]).toBe(64)
    expect(result.data[11]).toBe(128)
    expect(result.data[15]).toBe(255)
  })
})

describe('neutral color preservation', () => {
  it('keeps a grey pixel neutral under a preset with no temperature or tint shift', () => {
    // high-contrast only touches contrast/saturation/shadows/highlights.
    // None of those mix channels together for an r=g=b input (saturation
    // pivots on luminance, which equals the input value when r=g=b), so a
    // grey pixel has to stay grey. The +/-2 tolerance covers the same
    // interpolation rounding as the identity test above.
    const source = { data: new Uint8ClampedArray([128, 128, 128, 255]), width: 1, height: 1 }

    const result = applyParams(source, presets['high-contrast'], 33)

    expect(Math.abs(result.data[0] - result.data[1])).toBeLessThanOrEqual(2)
    expect(Math.abs(result.data[1] - result.data[2])).toBeLessThanOrEqual(2)
  })
})

describe('immutability', () => {
  it('does not modify the source buffer', () => {
    const data = new Uint8ClampedArray([12, 34, 56, 200, 1, 2, 3, 4])
    const before = Uint8ClampedArray.from(data)
    const source = { data, width: 2, height: 1 }

    applyParams(source, presets['cinematic-orange-teal'], 17)

    expect(data).toEqual(before)
  })
})
