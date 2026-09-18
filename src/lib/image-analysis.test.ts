import { describe, expect, it } from 'vitest'
import { analysisToLUTParams, analyzeImageData } from './image-analysis'
import { generateCubeLUT, defaultParams } from './lut-generator'

// analyzeImageData only reads data/width/height off the object it is given,
// so a plain object with that shape stands in for a real canvas ImageData.
function makeImageData(pixels: Array<[number, number, number]>, width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })
  return { data, width, height } as unknown as ImageData
}

function solidImageData(r: number, g: number, b: number, width: number, height: number): ImageData {
  const pixels: Array<[number, number, number]> = new Array(width * height).fill([r, g, b])
  return makeImageData(pixels, width, height)
}

describe('analyzeImageData', () => {
  it('reports a solid grey image as neutral and flat', () => {
    const analysis = analyzeImageData(solidImageData(128, 128, 128, 2, 2))

    expect(analysis.averageColor.r).toBeCloseTo(128 / 255, 5)
    expect(analysis.averageColor.g).toBeCloseTo(128 / 255, 5)
    expect(analysis.averageColor.b).toBeCloseTo(128 / 255, 5)
    expect(analysis.saturation).toBeCloseTo(0, 5)
    expect(analysis.temperature).toBeCloseTo(0, 5)
    // every pixel has the same luminance, so the 5th/95th percentile spread is zero
    expect(analysis.contrast).toBe(0)
    expect(analysis.brightness).toBeCloseTo(128 / 255, 5)
  })

  it('measures a warm image as positive temperature and a cool image as negative', () => {
    const warm = analyzeImageData(solidImageData(200, 100, 50, 2, 2))
    const cool = analyzeImageData(solidImageData(50, 100, 200, 2, 2))

    expect(warm.temperature).toBeGreaterThan(0)
    expect(cool.temperature).toBeLessThan(0)
    // symmetric red/blue swap, so the two temperatures should be mirror images
    expect(warm.temperature).toBeCloseTo(0.75, 5)
    expect(cool.temperature).toBeCloseTo(-0.75, 5)
  })

  it('measures a flat image as near zero contrast and a black/white split as maximum contrast', () => {
    const flat = analyzeImageData(solidImageData(128, 128, 128, 2, 2))

    const halfBlackHalfWhite = makeImageData(
      [
        ...Array(8).fill([0, 0, 0] as [number, number, number]),
        ...Array(8).fill([255, 255, 255] as [number, number, number]),
      ],
      4,
      4
    )
    const highContrast = analyzeImageData(halfBlackHalfWhite)

    expect(flat.contrast).toBe(0)
    // 8 black and 8 white pixels put the 5th percentile at pure black and
    // the 95th percentile at pure white, so the spread is the full range
    expect(highContrast.contrast).toBeCloseTo(1, 5)
    expect(highContrast.contrast).toBeGreaterThan(flat.contrast)
  })

  it('measures a fully saturated image near 1 and a greyscale image near 0', () => {
    const saturated = analyzeImageData(solidImageData(255, 0, 0, 2, 2))
    const greyscale = analyzeImageData(
      makeImageData(
        [
          [0, 0, 0],
          [85, 85, 85],
          [170, 170, 170],
          [255, 255, 255],
        ],
        2,
        2
      )
    )

    expect(saturated.saturation).toBeCloseTo(1, 5)
    expect(greyscale.saturation).toBeCloseTo(0, 5)
  })

  it('handles the all black and all white boundaries', () => {
    const black = analyzeImageData(solidImageData(0, 0, 0, 2, 2))
    const white = analyzeImageData(solidImageData(255, 255, 255, 2, 2))

    expect(black.averageColor).toEqual({ r: 0, g: 0, b: 0 })
    expect(black.brightness).toBe(0)
    expect(black.saturation).toBe(0)
    expect(black.contrast).toBe(0)

    expect(white.averageColor).toEqual({ r: 1, g: 1, b: 1 })
    expect(white.brightness).toBeCloseTo(1, 5)
    expect(white.saturation).toBe(0)
    expect(white.contrast).toBe(0)
  })
})

describe('analysisToLUTParams', () => {
  it('keeps a solid grey image close to neutral, with contrast/saturation pulled negative', () => {
    const analysis = analyzeImageData(solidImageData(128, 128, 128, 2, 2))
    const params = analysisToLUTParams(analysis)

    expect(params.lift.r).toBeCloseTo(0, 2)
    expect(params.lift.g).toBeCloseTo(0, 2)
    expect(params.lift.b).toBeCloseTo(0, 2)
    expect(params.gamma.r).toBeCloseTo(0, 2)
    expect(params.gain.r).toBeCloseTo(0, 2)
    expect(params.temperature).toBeCloseTo(0, 5)
    expect(params.tint).toBeCloseTo(0, 5)
    // measured contrast/saturation of 0 are below the function's 0.5/0.3
    // neutral points, so both params land negative
    expect(params.contrast).toBeCloseTo(-0.3, 5)
    expect(params.saturation).toBeCloseTo(-0.45, 5)
    expect(params.shadows).toBe(0)
    expect(params.highlights).toBe(0)
  })

  it('gives warm and cool images opposite-sign temperature params', () => {
    const warm = analysisToLUTParams(analyzeImageData(solidImageData(200, 100, 50, 2, 2)))
    const cool = analysisToLUTParams(analyzeImageData(solidImageData(50, 100, 200, 2, 2)))

    expect(warm.temperature).toBeGreaterThan(0)
    expect(cool.temperature).toBeLessThan(0)
    expect(warm.temperature).toBeCloseTo(0.6, 5)
    expect(cool.temperature).toBeCloseTo(-0.6, 5)
  })

  it('gives a high-contrast image a higher contrast param than a flat one', () => {
    const flat = analysisToLUTParams(analyzeImageData(solidImageData(128, 128, 128, 2, 2)))
    const highContrast = analysisToLUTParams(
      analyzeImageData(
        makeImageData(
          [
            ...Array(8).fill([0, 0, 0] as [number, number, number]),
            ...Array(8).fill([255, 255, 255] as [number, number, number]),
          ],
          4,
          4
        )
      )
    )

    expect(highContrast.contrast).toBeGreaterThan(flat.contrast)
    expect(highContrast.contrast).toBeCloseTo(0.3, 5)
    expect(flat.contrast).toBeCloseTo(-0.3, 5)
  })

  it('gives a fully saturated image a higher saturation param than a greyscale one', () => {
    const saturated = analysisToLUTParams(analyzeImageData(solidImageData(255, 0, 0, 2, 2)))
    const greyscale = analysisToLUTParams(
      analyzeImageData(
        makeImageData(
          [
            [0, 0, 0],
            [85, 85, 85],
            [170, 170, 170],
            [255, 255, 255],
          ],
          2,
          2
        )
      )
    )

    expect(saturated.saturation).toBeGreaterThan(greyscale.saturation)
    // (1 - 0.3) * 1.5 = 1.05, clamped to the param's -1..1 range
    expect(saturated.saturation).toBeCloseTo(1, 5)
    expect(greyscale.saturation).toBeCloseTo(-0.45, 5)
  })

  it('handles the all white boundary without producing NaN', () => {
    const white = analysisToLUTParams(analyzeImageData(solidImageData(255, 255, 255, 2, 2)))

    expect(white.lift.r).toBeCloseTo(0.15, 5)
    expect(white.gamma.r).toBeCloseTo(0.25, 5)
    expect(white.gain.r).toBeCloseTo(0, 5)
    expect(white.gain.g).toBeCloseTo(0, 5)
    expect(white.gain.b).toBeCloseTo(0, 5)
    expect(white.shadows).toBe(0)
    // brightness of 1 is above the 0.6 highlights threshold
    expect(white.highlights).toBeCloseTo(0.2, 5)
  })

  it('handles the all black boundary without producing NaN', () => {
    // gain divides each average channel by the largest average channel. A pure
    // black image makes all three averages 0, so that division was 0/0 and the
    // clamp afterwards does not rescue a NaN: a black reference produced a
    // .cube file full of NaN that no editor will load. A black image has no
    // dominant channel, so no gain shift is the right answer.
    const black = analysisToLUTParams(analyzeImageData(solidImageData(0, 0, 0, 2, 2)))

    expect(black.lift.r).toBeCloseTo(-0.15, 5)
    expect(black.gamma.r).toBeCloseTo(-0.25, 5)
    expect(black.gain.r).toBe(0)
    expect(black.gain.g).toBe(0)
    expect(black.gain.b).toBe(0)
    expect(black.shadows).toBeCloseTo(-0.2, 5)
    expect(black.highlights).toBe(0)
  })

  it('writes a .cube with no NaN in it from a black reference', () => {
    // The regression that matters is not the parameter value, it is the file.
    // Assert on the output text so this cannot pass again while the generated
    // LUT is unloadable.
    const params = analysisToLUTParams(analyzeImageData(solidImageData(0, 0, 0, 2, 2)))
    const cube = generateCubeLUT({ ...defaultParams, ...params }, 'black reference', 5)

    expect(cube).not.toContain('NaN')
    expect(cube.split('\n').filter(l => l.trim() && !l.startsWith('#') && !/^[A-Z_]/.test(l)).length)
      .toBe(125)
  })
})
