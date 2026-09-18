// Histogram Library
// A grade changes the shape of the tonal distribution, not just how the
// picture looks, so a grading tool needs to show the distribution itself.
// This module only reads a plain ImageData-shaped buffer: no canvas, no
// DOM, so the same code runs in a browser preview and in a node test.

// Rec. 709 luma weights. Rec. 601 (the older SD/CRT standard) uses
// 0.299/0.587/0.114 instead, which puts noticeably more weight on red and
// less on green; on graded footage that difference is large enough to
// mislabel a clip as darker or brighter than it reads on a 709 monitor.
// HD/UHD delivery is 709 (or its 2020 successor), so 709 is what this
// module uses for every luminance figure.
export const REC709_LUMA_COEFFICIENTS = {
  r: 0.2126,
  g: 0.7152,
  b: 0.0722,
}

export interface Histogram {
  // number of buckets each channel array below is divided into (1..256)
  bins: number
  // pixels actually counted; fully transparent pixels are excluded, see computeHistogram
  totalPixels: number
  red: Uint32Array
  green: Uint32Array
  blue: Uint32Array
  luminance: Uint32Array
  // Exact per-pixel accumulators, independent of `bins`. Clipping and mean
  // need to stay exact even when the display histogram is coarser than
  // 256 bins, where a wide bin would otherwise lump near-black/near-white
  // pixels in with true 0/255 and quietly hide a clip.
  luminanceSum: number
  luminanceClippedBlack: number
  luminanceClippedWhite: number
}

export interface HistogramStats {
  p5: number
  p95: number
  median: number
  mean: number
  // fraction of pixels (0..1), not a percentage
  clippedBlackFraction: number
  clippedWhiteFraction: number
}

export interface NormalizedHistogram {
  bins: number
  totalPixels: number
  // every array scaled 0..1 against the single largest bin across all
  // four channels, see normalizeHistogram
  red: Float64Array
  green: Float64Array
  blue: Float64Array
  luminance: Float64Array
}

// `bins` is reported as an error rather than crashing on an out-of-range
// array index or silently clamping/rounding to something the caller did
// not ask for. Convention used consistently across this module: throw a
// TypeError with the offending value, do not return a partial result.
function validateBins(bins: number): void {
  if (!Number.isInteger(bins) || bins < 1 || bins > 256) {
    throw new TypeError(
      `histogram bins must be an integer between 1 and 256, got ${bins}`
    )
  }
}

// Maps an 8-bit channel value (0..255) to a bin index in 0..bins-1.
// bins divides evenly into powers of two up to 256, so value * bins is an
// exact integer product and the /256 is an exact power-of-two division:
// no floating point drift to guard against here.
function binIndex(value: number, bins: number): number {
  return Math.floor((value * bins) / 256)
}

// Reads an ImageData-shaped buffer and bins red, green, blue and luminance.
// Fully transparent pixels (alpha 0) are skipped and do not count toward
// totalPixels or any bin, since a preview may be drawn on a transparent
// canvas and those pixels carry no colour information worth grading.
export function computeHistogram(source: ImageData, bins: number = 256): Histogram {
  validateBins(bins)

  const { data } = source

  const red = new Uint32Array(bins)
  const green = new Uint32Array(bins)
  const blue = new Uint32Array(bins)
  const luminance = new Uint32Array(bins)

  let totalPixels = 0
  let luminanceSum = 0
  let luminanceClippedBlack = 0
  let luminanceClippedWhite = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // Rounded to the nearest 8-bit level so a continuous weighted sum
    // bins the same way a real channel value would, and so pure black
    // and pure white land exactly on 0 and 255 despite float rounding
    // in the coefficients (e.g. 255*(sum of the three weights) lands a
    // hair under 255 before rounding).
    let lum = Math.round(
      r * REC709_LUMA_COEFFICIENTS.r +
      g * REC709_LUMA_COEFFICIENTS.g +
      b * REC709_LUMA_COEFFICIENTS.b
    )
    if (lum < 0) lum = 0
    else if (lum > 255) lum = 255

    red[binIndex(r, bins)]++
    green[binIndex(g, bins)]++
    blue[binIndex(b, bins)]++
    luminance[binIndex(lum, bins)]++

    luminanceSum += lum
    if (lum === 0) luminanceClippedBlack++
    else if (lum === 255) luminanceClippedWhite++

    totalPixels++
  }

  return {
    bins,
    totalPixels,
    red,
    green,
    blue,
    luminance,
    luminanceSum,
    luminanceClippedBlack,
    luminanceClippedWhite,
  }
}

// Percentile via the cumulative luminance histogram: walk bins low to
// high and return the lower edge of the first bin whose running count
// reaches the target rank. With the default 256 bins a bin's lower edge
// equals the raw pixel value, so this is exact; coarser bins report the
// edge of whichever bucket the rank falls in.
function luminancePercentile(h: Histogram, p: number): number {
  const binWidth = 256 / h.bins
  const target = p * h.totalPixels
  let cumulative = 0
  for (let i = 0; i < h.luminance.length; i++) {
    cumulative += h.luminance[i]
    if (cumulative >= target) return i * binWidth
  }
  return (h.luminance.length - 1) * binWidth
}

// Stats a grader actually needs: where the tones sit (percentiles,
// median, mean) and whether any got crushed flat (clipping). Clipping is
// reported as an exact fraction of pixels sitting at 0 or 255, not an
// estimate read off the percentiles, because a grade can clip a small
// fraction of pixels without moving the 5th/95th percentile at all.
export function histogramStats(h: Histogram): HistogramStats {
  if (h.totalPixels === 0) {
    return { p5: 0, p95: 0, median: 0, mean: 0, clippedBlackFraction: 0, clippedWhiteFraction: 0 }
  }

  return {
    p5: luminancePercentile(h, 0.05),
    p95: luminancePercentile(h, 0.95),
    median: luminancePercentile(h, 0.5),
    mean: h.luminanceSum / h.totalPixels,
    clippedBlackFraction: h.luminanceClippedBlack / h.totalPixels,
    clippedWhiteFraction: h.luminanceClippedWhite / h.totalPixels,
  }
}

function normalizeChannel(channel: Uint32Array, scale: number): Float64Array {
  const out = new Float64Array(channel.length)
  for (let i = 0; i < channel.length; i++) out[i] = channel[i] * scale
  return out
}

// Scales every channel against one shared peak (the tallest bin found in
// any of the four arrays), not each channel's own peak. Per-channel
// normalization would stretch a flat, low-count channel to look as tall
// as a spiky, high-count one, which defeats the point of drawing all four
// on one axis: relative height across channels has to stay meaningful.
export function normalizeHistogram(h: Histogram): NormalizedHistogram {
  let max = 0
  for (const channel of [h.red, h.green, h.blue, h.luminance]) {
    for (let i = 0; i < channel.length; i++) {
      if (channel[i] > max) max = channel[i]
    }
  }

  const scale = max > 0 ? 1 / max : 0

  return {
    bins: h.bins,
    totalPixels: h.totalPixels,
    red: normalizeChannel(h.red, scale),
    green: normalizeChannel(h.green, scale),
    blue: normalizeChannel(h.blue, scale),
    luminance: normalizeChannel(h.luminance, scale),
  }
}
