// Adobe .cube LUT parser
// Reads back what lut-generator.ts writes: TITLE/DOMAIN_MIN/DOMAIN_MAX/LUT_3D_SIZE
// headers in any order, then LUT_3D_SIZE^3 data rows in red-major order (red
// varies fastest, then green, then blue). Never throws: malformed input comes
// back as a structured error with the line number that caused it.

export type ParsedCube =
  | {
      ok: true
      size: number
      data: Float32Array
      title?: string
      domainMin: [number, number, number]
      domainMax: [number, number, number]
    }
  | { ok: false; error: string; line?: number }

// Windows/Unix/old-Mac line endings all parse the same way
function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/)
}

// LUT_3D_SIZE must be a bare positive integer: no sign, no decimal point, no exponent
function isPositiveIntegerToken(token: string): boolean {
  return /^[0-9]+$/.test(token) && Number(token) > 0
}

// Number() accepts things a LUT value never should (empty string is 0, "  " is 0),
// but tokens here are already whitespace-split, so the only real gap is NaN/Infinity
function parseNumericToken(token: string): number | null {
  const value = Number(token)
  return Number.isFinite(value) ? value : null
}

export function parseCube(text: string): ParsedCube {
  const rawLines = splitLines(text)
  const totalLines = rawLines.length

  let size: number | undefined
  let title: string | undefined
  let domainMin: [number, number, number] = [0, 0, 0]
  let domainMax: [number, number, number] = [1, 1, 1]

  // Rows are collected regardless of when LUT_3D_SIZE shows up, so header/data
  // ordering doesn't matter; only the final count is checked against size^3.
  const rows: number[][] = []
  const rowLines: number[] = []

  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1
    const trimmed = rawLines[i].trim()

    if (trimmed.length === 0) continue
    if (trimmed.startsWith('#')) continue

    const tokens = trimmed.split(/\s+/)
    const keyword = tokens[0]

    if (keyword === 'LUT_1D_SIZE') {
      return {
        ok: false,
        error: 'This file is a 1D LUT (LUT_1D_SIZE); only 3D LUTs (LUT_3D_SIZE) are supported',
        line: lineNumber,
      }
    }

    if (keyword === 'TITLE') {
      // Keep the quoted title verbatim (including internal spacing) rather than
      // rejoining whitespace-split tokens, which would collapse it
      const quoted = trimmed.match(/^TITLE\s+"([^"]*)"\s*$/)
      title = quoted ? quoted[1] : trimmed.slice('TITLE'.length).trim()
      continue
    }

    if (keyword === 'LUT_3D_SIZE') {
      if (tokens.length !== 2) {
        return {
          ok: false,
          error: `LUT_3D_SIZE requires exactly one value, found ${tokens.length - 1}`,
          line: lineNumber,
        }
      }
      if (!isPositiveIntegerToken(tokens[1])) {
        return {
          ok: false,
          error: `LUT_3D_SIZE must be a positive integer, got "${tokens[1]}"`,
          line: lineNumber,
        }
      }
      size = Number(tokens[1])
      continue
    }

    if (keyword === 'DOMAIN_MIN' || keyword === 'DOMAIN_MAX') {
      if (tokens.length !== 4) {
        return {
          ok: false,
          error: `${keyword} requires exactly 3 values, found ${tokens.length - 1}`,
          line: lineNumber,
        }
      }
      const parsed: number[] = []
      for (let t = 1; t <= 3; t++) {
        const value = parseNumericToken(tokens[t])
        if (value === null) {
          return {
            ok: false,
            error: `${keyword} has a non-numeric value "${tokens[t]}"`,
            line: lineNumber,
          }
        }
        parsed.push(value)
      }
      if (keyword === 'DOMAIN_MIN') {
        domainMin = [parsed[0], parsed[1], parsed[2]]
      } else {
        domainMax = [parsed[0], parsed[1], parsed[2]]
      }
      continue
    }

    // Anything else non-blank and non-comment is a data row: r g b
    if (tokens.length !== 3) {
      return {
        ok: false,
        error: `Expected 3 values on data row, found ${tokens.length}`,
        line: lineNumber,
      }
    }

    const rgb: number[] = []
    for (const token of tokens) {
      const value = parseNumericToken(token)
      if (value === null) {
        return {
          ok: false,
          error: `Non-numeric value "${token}" in data row`,
          line: lineNumber,
        }
      }
      rgb.push(value)
    }

    rows.push(rgb)
    rowLines.push(lineNumber)
  }

  if (size === undefined) {
    return {
      ok: false,
      error: 'Missing LUT_3D_SIZE: no 3D LUT size directive was found in this file',
      line: totalLines,
    }
  }

  const expectedRows = size * size * size

  if (rows.length < expectedRows) {
    return {
      ok: false,
      error: `Expected ${expectedRows} data rows for LUT_3D_SIZE ${size}, found ${rows.length} (ran out at end of file)`,
      line: totalLines,
    }
  }

  if (rows.length > expectedRows) {
    return {
      ok: false,
      error: `Expected ${expectedRows} data rows for LUT_3D_SIZE ${size}, found more than that`,
      line: rowLines[expectedRows],
    }
  }

  // Rows are already in file order, which for a valid .cube file is red-major
  // order, so this flatten is a direct copy: row i is grid cell (i % size,
  // Math.floor(i / size) % size, Math.floor(i / size / size))
  const data = new Float32Array(expectedRows * 3)
  for (let r = 0; r < expectedRows; r++) {
    data[r * 3] = rows[r][0]
    data[r * 3 + 1] = rows[r][1]
    data[r * 3 + 2] = rows[r][2]
  }

  return {
    ok: true,
    size,
    data,
    title,
    domainMin,
    domainMax,
  }
}

// Trilinear lookup for previewing a parsed LUT. r/g/b are normalized 0..1
// positions in the LUT's own grid space; mapping a pixel's DOMAIN_MIN..MAX
// value into that space is the caller's job, not this function's.
export function sampleCube(
  data: Float32Array,
  size: number,
  r: number,
  g: number,
  b: number
): [number, number, number] {
  const scale = size - 1
  const clampCoord = (value: number): number => Math.min(Math.max(value, 0), scale)

  const rf = clampCoord(r * scale)
  const gf = clampCoord(g * scale)
  const bf = clampCoord(b * scale)

  const r0 = Math.floor(rf)
  const g0 = Math.floor(gf)
  const b0 = Math.floor(bf)
  const r1 = Math.min(r0 + 1, scale)
  const g1 = Math.min(g0 + 1, scale)
  const b1 = Math.min(b0 + 1, scale)

  const fr = rf - r0
  const fg = gf - g0
  const fb = bf - b0

  const at = (ri: number, gi: number, bi: number): [number, number, number] => {
    const idx = (bi * size * size + gi * size + ri) * 3
    return [data[idx], data[idx + 1], data[idx + 2]]
  }

  const lerp = (a: number, z: number, t: number): number => a + (z - a) * t

  const c000 = at(r0, g0, b0)
  const c100 = at(r1, g0, b0)
  const c010 = at(r0, g1, b0)
  const c110 = at(r1, g1, b0)
  const c001 = at(r0, g0, b1)
  const c101 = at(r1, g0, b1)
  const c011 = at(r0, g1, b1)
  const c111 = at(r1, g1, b1)

  const out: [number, number, number] = [0, 0, 0]
  for (let ch = 0; ch < 3; ch++) {
    const c00 = lerp(c000[ch], c100[ch], fr)
    const c10 = lerp(c010[ch], c110[ch], fr)
    const c01 = lerp(c001[ch], c101[ch], fr)
    const c11 = lerp(c011[ch], c111[ch], fr)
    const c0 = lerp(c00, c10, fg)
    const c1 = lerp(c01, c11, fg)
    out[ch] = lerp(c0, c1, fb)
  }

  return out
}
