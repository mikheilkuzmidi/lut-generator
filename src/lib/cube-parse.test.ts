import { describe, expect, it } from 'vitest'
import { parseCube, sampleCube } from './cube-parse'
import { defaultParams, generateCubeLUT, transformColor, type LUTParams } from './lut-generator'

describe('parseCube: round trip with generateCubeLUT', () => {
  it('round-trips a default-params LUT (identity transform) at size 2', () => {
    const text = generateCubeLUT(defaultParams, 'Identity', 2)
    const result = parseCube(text)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.size).toBe(2)
    expect(result.data.length).toBe(2 ** 3 * 3)

    // defaultParams is a no-op transform, so the (0,0,0) and (1,1,1) grid
    // corners map straight through to themselves
    expect(result.data[0]).toBeCloseTo(0, 5)
    expect(result.data[1]).toBeCloseTo(0, 5)
    expect(result.data[2]).toBeCloseTo(0, 5)

    const lastRow = (2 ** 3 - 1) * 3
    expect(result.data[lastRow]).toBeCloseTo(1, 5)
    expect(result.data[lastRow + 1]).toBeCloseTo(1, 5)
    expect(result.data[lastRow + 2]).toBeCloseTo(1, 5)
  })

  it('round-trips a graded LUT at a different size (5), matching transformColor', () => {
    const params: LUTParams = {
      ...defaultParams,
      contrast: 0.2,
      saturation: -0.1,
      temperature: 0.15,
      lift: { r: 0.05, g: 0, b: -0.05 },
      gamma: { r: 0, g: 0.1, b: 0 },
      gain: { r: 0, g: 0, b: 0.1 },
    }
    const size = 5
    const text = generateCubeLUT(params, 'Graded', size)
    const result = parseCube(text)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.size).toBe(size)
    expect(result.data.length).toBe(size ** 3 * 3)

    // pick an interior grid cell and compare against the transform directly,
    // rather than hand-computing the expected color
    const rIdx = 2
    const gIdx = 4
    const bIdx = 1
    const rowIndex = bIdx * size * size + gIdx * size + rIdx
    const [expR, expG, expB] = transformColor(
      rIdx / (size - 1),
      gIdx / (size - 1),
      bIdx / (size - 1),
      params
    )

    expect(result.data[rowIndex * 3]).toBeCloseTo(expR, 5)
    expect(result.data[rowIndex * 3 + 1]).toBeCloseTo(expG, 5)
    expect(result.data[rowIndex * 3 + 2]).toBeCloseTo(expB, 5)

    // sampling at the exact grid coordinate should agree with the raw row,
    // since fr/fg/fb are all 0 there (no blending to introduce drift)
    const sampled = sampleCube(result.data, size, rIdx / (size - 1), gIdx / (size - 1), bIdx / (size - 1))
    expect(sampled[0]).toBeCloseTo(expR, 5)
    expect(sampled[1]).toBeCloseTo(expG, 5)
    expect(sampled[2]).toBeCloseTo(expB, 5)
  })
})

describe('parseCube: hand-written minimal file', () => {
  it('parses an exact 2x2x2 cube and preserves red-major ordering', () => {
    // Each row's own values are its (r,g,b) grid coordinate, so the row
    // order itself is the proof of red-major layout below.
    const lines = [
      'TITLE "Mini Test"',
      'LUT_3D_SIZE 2',
      'DOMAIN_MIN 0.0 0.0 0.0',
      'DOMAIN_MAX 1.0 1.0 1.0',
      '0.0 0.0 0.0',
      '1.0 0.0 0.0',
      '0.0 1.0 0.0',
      '1.0 1.0 0.0',
      '0.0 0.0 1.0',
      '1.0 0.0 1.0',
      '0.0 1.0 1.0',
      '1.0 1.0 1.0',
    ]
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.title).toBe('Mini Test')
    expect(result.size).toBe(2)
    expect(result.data.length).toBe(24)
    expect(result.domainMin).toEqual([0, 0, 0])
    expect(result.domainMax).toEqual([1, 1, 1])

    const corner = (rowIndex: number) => [
      result.data[rowIndex * 3],
      result.data[rowIndex * 3 + 1],
      result.data[rowIndex * 3 + 2],
    ]

    expect(corner(0)).toEqual([0, 0, 0]) // r=0,g=0,b=0
    expect(corner(1)).toEqual([1, 0, 0]) // red varies fastest: row 1 flips r
    expect(corner(2)).toEqual([0, 1, 0]) // green flips only after a full r cycle
    expect(corner(3)).toEqual([1, 1, 0])
    expect(corner(4)).toEqual([0, 0, 1]) // blue flips only after a full r*g cycle
    expect(corner(7)).toEqual([1, 1, 1])

    // sampleCube at the same exact corners should agree with the raw rows
    expect(sampleCube(result.data, 2, 1, 0, 0)).toEqual([1, 0, 0])
    expect(sampleCube(result.data, 2, 0, 1, 0)).toEqual([0, 1, 0])
  })
})

describe('parseCube: format tolerance', () => {
  it('parses CRLF line endings, tab-separated values, and trailing whitespace', () => {
    const lines = [
      'LUT_3D_SIZE 2',
      'DOMAIN_MIN 0.0 0.0 0.0  ',
      'DOMAIN_MAX 1.0 1.0 1.0',
      '0.0\t0.0\t0.0',
      '1.0\t0.0\t0.0',
      '0.0\t1.0\t0.0',
      '1.0\t1.0\t0.0',
      '0.0\t0.0\t1.0',
      '1.0\t0.0\t1.0',
      '0.0\t1.0\t1.0',
      '1.0\t1.0\t1.0',
    ]
    const result = parseCube(lines.join('\r\n'))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.size).toBe(2)
    expect(result.data.length).toBe(24)
    expect(result.data[3]).toBe(1) // row 1 is (r=1,g=0,b=0); R channel
  })

  it('parses headers in any order with comments and blank lines interleaved', () => {
    const lines = [
      '# a comment before anything else',
      '',
      'DOMAIN_MAX 1.0 1.0 1.0',
      '# comment between headers',
      'TITLE "Shuffled"',
      '',
      'DOMAIN_MIN 0.0 0.0 0.0',
      'LUT_3D_SIZE 2',
      '',
      '# data follows',
      '0.0 0.0 0.0',
      '1.0 0.0 0.0',
      '0.0 1.0 0.0',
      '1.0 1.0 0.0',
      '0.0 0.0 1.0',
      '1.0 0.0 1.0',
      '0.0 1.0 1.0',
      '1.0 1.0 1.0',
    ]
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.title).toBe('Shuffled')
    expect(result.size).toBe(2)
    expect(result.domainMin).toEqual([0, 0, 0])
    expect(result.domainMax).toEqual([1, 1, 1])
    expect(result.data.length).toBe(24)
  })

  it('defaults domain to 0..1 and leaves title undefined when omitted', () => {
    const text = ['LUT_3D_SIZE 1', '0.5 0.5 0.5'].join('\n')
    const result = parseCube(text)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.title).toBeUndefined()
    expect(result.domainMin).toEqual([0, 0, 0])
    expect(result.domainMax).toEqual([1, 1, 1])
  })

  it('does not clamp out-of-range values and reports the domain it read', () => {
    const text = [
      'LUT_3D_SIZE 1',
      'DOMAIN_MIN -1.0 -1.0 -1.0',
      'DOMAIN_MAX 2.0 2.0 2.0',
      '-0.5 1.5 2.5',
    ].join('\n')
    const result = parseCube(text)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.domainMin).toEqual([-1, -1, -1])
    expect(result.domainMax).toEqual([2, 2, 2])
    expect(Array.from(result.data)).toEqual([-0.5, 1.5, 2.5])
  })
})

describe('parseCube: LUT_1D_SIZE', () => {
  it('rejects a 1D LUT with a clear reason instead of misreading it as 3D', () => {
    const text = ['TITLE "OneD"', 'LUT_1D_SIZE 4', '0.0 0.0 0.0'].join('\n')
    const result = parseCube(text)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toMatch(/LUT_1D_SIZE/)
    expect(result.error.toLowerCase()).toContain('only 3d luts')
    expect(result.line).toBe(2)
  })
})

describe('parseCube: error cases', () => {
  it('reports a missing LUT_3D_SIZE at the end of the file', () => {
    const lines = [
      'TITLE "No Size"',
      'DOMAIN_MIN 0.0 0.0 0.0',
      'DOMAIN_MAX 1.0 1.0 1.0',
      '0.0 0.0 0.0',
      '1.0 1.0 1.0',
    ]
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toMatch(/LUT_3D_SIZE/)
    expect(result.line).toBe(5)
  })

  it.each(['abc', '-2', '3.5', '0'])('rejects a non-positive-integer LUT_3D_SIZE value "%s"', (token) => {
    const text = ['TITLE "Bad Size"', `LUT_3D_SIZE ${token}`].join('\n')
    const result = parseCube(text)

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toMatch(/positive integer/)
    expect(result.line).toBe(2)
  })

  it('reports too few data rows for size^3', () => {
    const lines = ['LUT_3D_SIZE 2', '0.0 0.0 0.0', '1.0 0.0 0.0', '0.0 1.0 0.0']
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('Expected 8')
    expect(result.error).toContain('found 3')
    expect(result.line).toBe(4) // ran out at the last physical line
  })

  it('reports too many data rows for size^3', () => {
    const dataRows = Array.from({ length: 9 }, () => '0.0 0.0 0.0')
    const lines = ['LUT_3D_SIZE 2', ...dataRows]
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('Expected 8')
    expect(result.line).toBe(10) // the 9th data row, one past the expected 8
  })

  it('reports a row with fewer than three values', () => {
    const lines = ['LUT_3D_SIZE 2', '0.0 0.0 0.0', '1.0 0.0']
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('found 2')
    expect(result.line).toBe(3)
  })

  it('reports a row with more than three values', () => {
    const lines = ['LUT_3D_SIZE 2', '0.0 0.0 0.0 0.0']
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('found 4')
    expect(result.line).toBe(2)
  })

  it('reports a non-numeric value in a row, naming the offending token', () => {
    const lines = ['LUT_3D_SIZE 2', '0.0 abc 0.0']
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('abc')
    expect(result.line).toBe(2)
  })

  it('reports a malformed DOMAIN_MIN line', () => {
    const lines = ['LUT_3D_SIZE 2', 'DOMAIN_MIN 0.0 0.0']
    const result = parseCube(lines.join('\n'))

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.error).toContain('DOMAIN_MIN')
    expect(result.line).toBe(2)
  })
})

describe('sampleCube', () => {
  it('returns exact grid values at integer coordinates', () => {
    const size = 2
    const data = new Float32Array([
      0, 0, 0, // (0,0,0)
      10, 0, 0, // (1,0,0)
      0, 10, 0, // (0,1,0)
      10, 10, 0, // (1,1,0)
      0, 0, 10, // (0,0,1)
      10, 0, 10, // (1,0,1)
      0, 10, 10, // (0,1,1)
      10, 10, 10, // (1,1,1)
    ])

    expect(sampleCube(data, size, 1, 0, 0)).toEqual([10, 0, 0])
    expect(sampleCube(data, size, 0, 1, 1)).toEqual([0, 10, 10])
  })

  it('interpolates linearly along one axis rather than snapping to the nearest sample', () => {
    const size = 2
    const data = new Float32Array([
      10, 10, 10, // (0,0,0)
      20, 20, 20, // (1,0,0)
      10, 10, 10, // (0,1,0)
      20, 20, 20, // (1,1,0)
      10, 10, 10, // (0,0,1)
      20, 20, 20, // (1,0,1)
      10, 10, 10, // (0,1,1)
      20, 20, 20, // (1,1,1)
    ])

    // nearest-neighbor would snap r=0.25 down to the r=0 sample (10);
    // linear interpolation gives 10 + (20-10)*0.25 = 12.5
    const [r] = sampleCube(data, size, 0.25, 0, 0)
    expect(r).toBeCloseTo(12.5, 5)
    expect(r).not.toBe(10)
  })

  it('interpolates across all three axes at the cube center', () => {
    const size = 2
    const values = [0, 1, 2, 3, 4, 5, 6, 7] // r + 2g + 4b for each corner, in file order
    const data = new Float32Array(values.length * 3)
    values.forEach((v, i) => {
      data[i * 3] = v
      data[i * 3 + 1] = v
      data[i * 3 + 2] = v
    })

    // trilinear at the exact center weighs all 8 corners equally: their mean is 3.5
    const [r, g, b] = sampleCube(data, size, 0.5, 0.5, 0.5)
    expect(r).toBeCloseTo(3.5, 5)
    expect(g).toBeCloseTo(3.5, 5)
    expect(b).toBeCloseTo(3.5, 5)
  })
})
