import { describe, test, expect } from 'vitest'
import {
  computeHistogram,
  histogramStats,
  normalizeHistogram,
  REC709_LUMA_COEFFICIENTS,
} from './histogram'

// Builds a minimal ImageData-shaped object (data/width/height only, no
// colorSpace) the way a node test constructs one without a real canvas.
// computeHistogram only ever reads those three fields.
function makeImageData(
  pixels: Array<[number, number, number, number]>,
  width: number,
  height: number
): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4)
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  })
  return { data, width, height } as unknown as ImageData
}

function solidImage(
  r: number,
  g: number,
  b: number,
  a: number,
  width: number,
  height: number
): ImageData {
  const pixels: Array<[number, number, number, number]> = Array.from(
    { length: width * height },
    () => [r, g, b, a]
  )
  return makeImageData(pixels, width, height)
}

describe('computeHistogram: solid images', () => {
  test('all-black image puts every channel and luminance count in bin 0', () => {
    const image = solidImage(0, 0, 0, 255, 3, 3)
    const h = computeHistogram(image)

    expect(h.totalPixels).toBe(9)
    expect(h.red[0]).toBe(9)
    expect(h.green[0]).toBe(9)
    expect(h.blue[0]).toBe(9)
    expect(h.luminance[0]).toBe(9)
  })

  test('all-white image puts every channel and luminance count in the top bin', () => {
    const image = solidImage(255, 255, 255, 255, 3, 3)
    const h = computeHistogram(image)

    expect(h.totalPixels).toBe(9)
    expect(h.red[255]).toBe(9)
    expect(h.green[255]).toBe(9)
    expect(h.blue[255]).toBe(9)
    expect(h.luminance[255]).toBe(9)
  })

  test('50 percent grey puts every channel and luminance count in the middle bin', () => {
    const image = solidImage(128, 128, 128, 255, 3, 3)
    const h = computeHistogram(image)

    expect(h.totalPixels).toBe(9)
    expect(h.red[128]).toBe(9)
    expect(h.green[128]).toBe(9)
    expect(h.blue[128]).toBe(9)
    expect(h.luminance[128]).toBe(9)
  })
})

test('a full grey ramp gives a flat histogram, one count per bin', () => {
  // one pixel at every 8-bit level, so with the default 256 bins each
  // bin should hold exactly one count on every channel
  const pixels: Array<[number, number, number, number]> = Array.from(
    { length: 256 },
    (_, i) => [i, i, i, 255]
  )
  const image = makeImageData(pixels, 256, 1)
  const h = computeHistogram(image)

  for (let i = 0; i < 256; i++) {
    expect(h.red[i]).toBe(1)
    expect(h.green[i]).toBe(1)
    expect(h.blue[i]).toBe(1)
    expect(h.luminance[i]).toBe(1)
  }
})

test('pure red lands in reds top bin, green/blue bottom bin, luminance where Rec.709 says', () => {
  const image = solidImage(255, 0, 0, 255, 4, 4)
  const h = computeHistogram(image)

  expect(h.red[255]).toBe(16)
  expect(h.green[0]).toBe(16)
  expect(h.blue[0]).toBe(16)

  // derived from the same coefficient the module uses, not a copied bin number
  const expectedLumaBin = Math.round(255 * REC709_LUMA_COEFFICIENTS.r)
  expect(h.luminance[expectedLumaBin]).toBe(16)
})

test('a non-256 bin count buckets values by quartile, proving binning is not hardcoded', () => {
  // with bins=4, edges fall at 64/128/192, so 0/63 -> bin0, 64/127 -> bin1,
  // 128/191 -> bin2, 192/255 -> bin3
  const pixels: Array<[number, number, number, number]> = [
    [0, 0, 0, 255],
    [63, 63, 63, 255],
    [64, 64, 64, 255],
    [127, 127, 127, 255],
    [128, 128, 128, 255],
    [191, 191, 191, 255],
    [192, 192, 192, 255],
    [255, 255, 255, 255],
  ]
  const image = makeImageData(pixels, pixels.length, 1)
  const h = computeHistogram(image, 4)

  expect(h.bins).toBe(4)
  expect(h.red).toHaveLength(4)
  expect(Array.from(h.red)).toEqual([2, 2, 2, 2])
  expect(Array.from(h.luminance)).toEqual([2, 2, 2, 2])
})

test('percentiles, median and mean on a known distribution', () => {
  // 20 pixels at 10, 60 at 50, 20 at 90 (grey, so luminance === value)
  const pixels: Array<[number, number, number, number]> = [
    ...Array.from({ length: 20 }, (): [number, number, number, number] => [10, 10, 10, 255]),
    ...Array.from({ length: 60 }, (): [number, number, number, number] => [50, 50, 50, 255]),
    ...Array.from({ length: 20 }, (): [number, number, number, number] => [90, 90, 90, 255]),
  ]
  const image = makeImageData(pixels, pixels.length, 1)
  const h = computeHistogram(image)
  const stats = histogramStats(h)

  // by hand: p5 target = 0.05*100 = 5, reached inside the first 20 -> 10
  expect(stats.p5).toBe(10)
  // median target = 50, cumulative after the first two groups is 80 >= 50 -> 50
  expect(stats.median).toBe(50)
  // p95 target = 95, only reached once the last 20 are added -> 90
  expect(stats.p95).toBe(90)
  // mean = (20*10 + 60*50 + 20*90) / 100 = 5000 / 100
  expect(stats.mean).toBe(50)
})

test('clipping fractions are exact counts at 0 and 255, independent of bin width', () => {
  const pixels: Array<[number, number, number, number]> = [
    ...Array.from({ length: 15 }, (): [number, number, number, number] => [0, 0, 0, 255]),
    ...Array.from({ length: 25 }, (): [number, number, number, number] => [255, 255, 255, 255]),
    ...Array.from({ length: 60 }, (): [number, number, number, number] => [128, 128, 128, 255]),
  ]
  const image = makeImageData(pixels, pixels.length, 1)

  // a coarse 16-bin histogram would lump plenty of near-black/near-white
  // values into the same edge bin as true 0/255; clipping must not do that
  const h = computeHistogram(image, 16)
  const stats = histogramStats(h)

  expect(h.luminanceClippedBlack).toBe(15)
  expect(h.luminanceClippedWhite).toBe(25)
  expect(stats.clippedBlackFraction).toBe(0.15)
  expect(stats.clippedWhiteFraction).toBe(0.25)
})

test('fully transparent pixels are excluded from every count', () => {
  const pixels: Array<[number, number, number, number]> = [
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [255, 0, 0, 255],
    [0, 0, 255, 0], // transparent: a very different colour that must not be counted
    [0, 0, 255, 0],
  ]
  const image = makeImageData(pixels, pixels.length, 1)
  const h = computeHistogram(image)

  expect(h.totalPixels).toBe(3)
  expect(h.red[255]).toBe(3)
  expect(h.blue[0]).toBe(3)
  // if the transparent pixels had leaked in, blue's top bin would be 2
  expect(h.blue[255]).toBe(0)
})

describe('computeHistogram: bins validation', () => {
  const image = solidImage(0, 0, 0, 255, 1, 1)

  test('rejects a non-integer bin count', () => {
    expect(() => computeHistogram(image, 10.5)).toThrow(TypeError)
  })

  test('rejects zero bins', () => {
    expect(() => computeHistogram(image, 0)).toThrow(TypeError)
  })

  test('rejects a negative bin count', () => {
    expect(() => computeHistogram(image, -5)).toThrow(TypeError)
  })

  test('rejects a bin count greater than 256', () => {
    expect(() => computeHistogram(image, 300)).toThrow(TypeError)
  })
})

describe('normalizeHistogram', () => {
  test('scales every channel against the single largest bin across all channels', () => {
    // 16 pure-black pixels: red/green/blue/luminance all pile into bin 0
    // with count 16, and every other bin stays 0
    const image = solidImage(0, 0, 0, 255, 4, 4)
    const h = computeHistogram(image)
    const n = normalizeHistogram(h)

    expect(n.red[0]).toBe(1)
    expect(n.green[0]).toBe(1)
    expect(n.blue[0]).toBe(1)
    expect(n.luminance[0]).toBe(1)
    expect(n.red[1]).toBe(0)
  })

  test('does not divide by zero when every pixel was excluded', () => {
    const image = makeImageData([[0, 0, 0, 0]], 1, 1) // fully transparent
    const h = computeHistogram(image)
    const n = normalizeHistogram(h)

    expect(Array.from(n.red).every((v) => v === 0)).toBe(true)
    expect(Array.from(n.luminance).every((v) => v === 0)).toBe(true)
  })
})

test('histogramStats on an all-excluded histogram returns zeros instead of NaN', () => {
  const image = makeImageData([[0, 0, 0, 0]], 1, 1)
  const h = computeHistogram(image)
  const stats = histogramStats(h)

  expect(stats).toEqual({
    p5: 0,
    p95: 0,
    median: 0,
    mean: 0,
    clippedBlackFraction: 0,
    clippedWhiteFraction: 0,
  })
})
