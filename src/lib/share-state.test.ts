import { describe, expect, it } from 'vitest'
import { defaultParams, presets, type LUTParams } from './lut-generator'
import { decodeState, encodeState, type ShareState } from './share-state'

// Extreme values at both ends of every slider range (-1 and 1), alternated
// per field so a bug that swaps two fields would still be caught.
const extremeLowHigh: LUTParams = {
  contrast: -1,
  saturation: 1,
  temperature: -1,
  tint: 1,
  shadows: -1,
  highlights: 1,
  lift: { r: -1, g: 1, b: -1 },
  gamma: { r: 1, g: -1, b: 1 },
  gain: { r: -1, g: 1, b: -1 },
}

const extremeHighLow: LUTParams = {
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

describe('encodeState / decodeState round-trip', () => {

  it('round-trips defaultParams in manual mode', () => {
    const state: ShareState = { mode: 'manual', params: defaultParams }
    const decoded = decodeState(encodeState(state))
    expect(decoded).toEqual(state)
  })

  it('round-trips extreme values at both ends of every range', () => {
    const low: ShareState = { mode: 'manual', params: extremeLowHigh }
    const high: ShareState = { mode: 'manual', params: extremeHighLow }

    expect(decodeState(encodeState(low))).toEqual(low)
    expect(decodeState(encodeState(high))).toEqual(high)
  })

  it('round-trips image mode, which carries no extra payload', () => {
    const state: ShareState = { mode: 'image' }
    expect(decodeState(encodeState(state))).toEqual(state)
  })

  it('keeps a typical manual share link well under 80 characters', () => {
    const encoded = encodeState({ mode: 'manual', params: presets['cinematic-orange-teal'] })
    expect(encoded.length).toBeLessThan(80)
  })
})

describe('decodeState rejects malformed input without throwing', () => {
  const validManual = encodeState({ mode: 'manual', params: defaultParams })
  const validPreset = encodeState({ mode: 'preset', presetId: 'vintage-film' })

  it('rejects a wrong version prefix', () => {
    expect(decodeState('9' + validManual.slice(1))).toBeNull()
  })

  it('rejects truncated input', () => {
    expect(decodeState(validManual.slice(0, -5))).toBeNull()
  })

  it('rejects an out-of-range number', () => {
    // "zz" is a valid base36 chunk (1295) but decodes far outside -1..1.
    const corrupted = validManual.slice(0, 3) + 'zz' + validManual.slice(5)
    expect(decodeState(corrupted)).toBeNull()
  })

  it('rejects a non-numeric field', () => {
    const corrupted = validManual.slice(0, 3) + '!!' + validManual.slice(5)
    expect(decodeState(corrupted)).toBeNull()
  })

  it('rejects an unknown preset id', () => {
    expect(decodeState('1ps' + 'not-a-real-preset')).toBeNull()
  })

  it('rejects an unknown mode', () => {
    expect(decodeState('1xs')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(decodeState('')).toBeNull()
  })

  it('rejects a string of the right length but complete garbage', () => {
    const garbage = 'x'.repeat(validManual.length)
    expect(decodeState(garbage)).toBeNull()
  })

  it('never throws, and returns null, on input with URL-escaped characters', () => {
    expect(() => decodeState('%3C%3E%20' + validPreset)).not.toThrow()
    expect(decodeState('%3C%3E%20' + validPreset)).toBeNull()

    expect(() => decodeState(validManual.slice(0, -3) + '%2B')).not.toThrow()
    expect(decodeState(validManual.slice(0, -3) + '%2B')).toBeNull()
  })
})
