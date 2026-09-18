// Share-link encoding for the current look, so it can be pasted into a URL hash.
//
// Format (version 1). The string is a flat run of characters, no separators,
// so length alone tells you whether a field is missing:
//
//   [0]     version marker, currently "1". A future format bump changes this
//           so old/new links can never be silently misread as each other.
//   [1]     mode code: i = image, p = preset, m = manual
//   [2..]   mode-specific payload:
//     image:   nothing; the string ends at index 3.
//     preset:  the raw preset id, e.g. "cinematic-orange-teal". Validated
//              against the live `presets` map on decode, so a renamed or
//              removed preset id fails instead of resolving to something else.
//     manual:  exactly 15 fields, 2 characters each (30 chars total), one
//              per LUTParams number, in this fixed order: contrast,
//              saturation, temperature, tint, shadows, highlights, lift.r,
//              lift.g, lift.b, gamma.r, gamma.g, gamma.b, gain.r, gain.g,
//              gain.b. Every field is a slider value in [-1, 1] at 0.01
//              steps (see the -100..100 range inputs in page.tsx), which is
//              201 possible values. Each is shifted by +100 to land in
//              0..200 and written as two base36 digits (36^2 = 1296 slots is
//              plenty and keeps every field a fixed 2-character width, so
//              truncation shows up as a length mismatch instead of shifting
//              later fields).
//
// A typical manual link is version(1) + mode(1) + 30 = 32 chars,
// comfortably short enough to paste into a chat message.
//
// To change the format later: bump VERSION, change the payload layout, and
// make sure decodeState rejects anything with the old VERSION rather than
// trying to parse it under the new rules.

import { presets, type LUTParams } from './lut-generator'

export type ShareMode = 'image' | 'preset' | 'manual'

export type ShareState =
  | { mode: 'image' }
  | { mode: 'preset'; presetId: string }
  | { mode: 'manual'; params: LUTParams }

const VERSION = '1'

const MODE_CODES: Record<ShareMode, string> = { image: 'i', preset: 'p', manual: 'm' }
const CODE_TO_MODE: Record<string, ShareMode> = { i: 'image', p: 'preset', m: 'manual' }


// Fixed field order for the manual payload. Splitting scalars from the RGB
// wheels keeps this readable while still producing one flat 15-number list.
const SCALAR_FIELDS: Array<
  'contrast' | 'saturation' | 'temperature' | 'tint' | 'shadows' | 'highlights'
> = ['contrast', 'saturation', 'temperature', 'tint', 'shadows', 'highlights']
const WHEEL_FIELDS: Array<'lift' | 'gamma' | 'gain'> = ['lift', 'gamma', 'gain']
const CHANNEL_FIELDS: Array<'r' | 'g' | 'b'> = ['r', 'g', 'b']

const NUMERIC_FIELD_COUNT = SCALAR_FIELDS.length + WHEEL_FIELDS.length * CHANNEL_FIELDS.length // 15

// Every LUTParams number the UI exposes uses the same -1..1 range at 0.01
// steps (the -100..100 sliders in page.tsx, divided by 100).
const PARAM_MIN = -1
const PARAM_MAX = 1

const CHUNK_RADIX = 36
const CHUNK_WIDTH = 2 // 36^2 = 1296 >= 201 possible values, so width never varies
const CHUNK_OFFSET = 100 // shifts -100..100 to 0..200 so toString(36) is never negative
const CHUNK_MAX = 200
const CHUNK_PATTERN = /^[0-9a-z]{2}$/

function flattenParams(params: LUTParams): number[] {
  const values: number[] = SCALAR_FIELDS.map((field) => params[field])
  for (const wheel of WHEEL_FIELDS) {
    for (const channel of CHANNEL_FIELDS) {
      values.push(params[wheel][channel])
    }
  }
  return values
}

function unflattenParams(values: number[]): LUTParams {
  const [
    contrast, saturation, temperature, tint, shadows, highlights,
    liftR, liftG, liftB, gammaR, gammaG, gammaB, gainR, gainG, gainB,
  ] = values
  return {
    contrast, saturation, temperature, tint, shadows, highlights,
    lift: { r: liftR, g: liftG, b: liftB },
    gamma: { r: gammaR, g: gammaG, b: gammaB },
    gain: { r: gainR, g: gainG, b: gainB },
  }
}

function encodeNumber(value: number): string {
  const n = Math.round(value * 100) + CHUNK_OFFSET
  return n.toString(CHUNK_RADIX).padStart(CHUNK_WIDTH, '0')
}

// Returns null instead of throwing so a corrupt chunk just fails the decode.
function decodeNumber(chunk: string): number | null {
  if (!CHUNK_PATTERN.test(chunk)) return null
  const n = parseInt(chunk, CHUNK_RADIX)
  if (!Number.isFinite(n) || n < 0 || n > CHUNK_MAX) return null
  const value = (n - CHUNK_OFFSET) / 100
  // Redundant with the n bound above today, but keeps the range check
  // explicit in case CHUNK_MAX and the param range ever drift apart.
  if (value < PARAM_MIN || value > PARAM_MAX) return null
  return value
}

export function encodeState(state: ShareState): string {
  const head = VERSION + MODE_CODES[state.mode]

  if (state.mode === 'image') return head
  if (state.mode === 'preset') return head + state.presetId
  return head + flattenParams(state.params).map(encodeNumber).join('')
}

export function decodeState(encoded: string): ShareState | null {
  try {
    if (typeof encoded !== 'string' || encoded.length < 2) return null
    if (encoded[0] !== VERSION) return null

    const mode = CODE_TO_MODE[encoded[1]]
    if (!mode) return null

    const rest = encoded.slice(2)

    if (mode === 'image') {
      return rest === '' ? { mode } : null
    }

    if (mode === 'preset') {
      // hasOwnProperty (not `in`) so inherited names like "constructor" can't match.
      if (rest.length === 0 || !Object.prototype.hasOwnProperty.call(presets, rest)) return null
      return { mode, presetId: rest }
    }

    // manual: payload must be exactly NUMERIC_FIELD_COUNT fixed-width chunks
    const expectedLength = NUMERIC_FIELD_COUNT * CHUNK_WIDTH
    if (rest.length !== expectedLength) return null

    const values: number[] = []
    for (let i = 0; i < NUMERIC_FIELD_COUNT; i++) {
      const chunk = rest.slice(i * CHUNK_WIDTH, i * CHUNK_WIDTH + CHUNK_WIDTH)
      const value = decodeNumber(chunk)
      if (value === null) return null
      values.push(value)
    }

    return { mode, params: unflattenParams(values) }
  } catch {
    // Any unexpected error (malformed input we didn't anticipate) is still a
    // decode failure, not a crash.
    return null
  }
}
