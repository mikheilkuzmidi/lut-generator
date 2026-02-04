// Image Analysis Library
// Analyzes images to extract color grading parameters

export interface ImageAnalysis {
  averageColor: { r: number; g: number; b: number }
  dominantColors: Array<{ r: number; g: number; b: number; percentage: number }>
  brightness: number
  contrast: number
  saturation: number
  temperature: number
  histogram: {
    r: number[]
    g: number[]
    b: number[]
    luminance: number[]
  }
}

// Convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  
  if (max === min) {
    return [0, 0, l]
  }
  
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  
  let h = 0
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6
  } else {
    h = ((r - g) / d + 4) / 6
  }
  
  return [h, s, l]
}

// Calculate luminance
function getLuminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

// Analyze image data from canvas
export function analyzeImageData(imageData: ImageData): ImageAnalysis {
  const { data, width, height } = imageData
  const pixelCount = width * height
  
  // Initialize accumulators
  let totalR = 0, totalG = 0, totalB = 0
  let totalSaturation = 0
  let totalLuminance = 0
  
  const histogram = {
    r: new Array(256).fill(0),
    g: new Array(256).fill(0),
    b: new Array(256).fill(0),
    luminance: new Array(256).fill(0),
  }
  
  // Color quantization for dominant colors (simplified)
  const colorBuckets: Map<string, { r: number; g: number; b: number; count: number }> = new Map()
  
  // Process each pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    
    totalR += r
    totalG += g
    totalB += b
    
    const [h, s, l] = rgbToHsl(r, g, b)
    totalSaturation += s
    
    const lum = getLuminance(r, g, b)
    totalLuminance += lum
    
    // Update histogram
    histogram.r[data[i]]++
    histogram.g[data[i + 1]]++
    histogram.b[data[i + 2]]++
    histogram.luminance[Math.floor(lum * 255)]++
    
    // Quantize color for dominant color detection (reduce to 32 levels per channel)
    const qr = Math.floor(r * 8) / 8
    const qg = Math.floor(g * 8) / 8
    const qb = Math.floor(b * 8) / 8
    const key = `${qr.toFixed(2)},${qg.toFixed(2)},${qb.toFixed(2)}`
    
    if (colorBuckets.has(key)) {
      colorBuckets.get(key)!.count++
    } else {
      colorBuckets.set(key, { r: qr, g: qg, b: qb, count: 1 })
    }
  }
  
  // Calculate averages
  const avgR = totalR / pixelCount
  const avgG = totalG / pixelCount
  const avgB = totalB / pixelCount
  const avgSaturation = totalSaturation / pixelCount
  const avgLuminance = totalLuminance / pixelCount
  
  // Calculate contrast from luminance histogram
  const lumValues: number[] = []
  for (let i = 0; i < data.length; i += 4) {
    const lum = getLuminance(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
    lumValues.push(lum)
  }
  lumValues.sort((a, b) => a - b)
  const p5 = lumValues[Math.floor(pixelCount * 0.05)]
  const p95 = lumValues[Math.floor(pixelCount * 0.95)]
  const contrast = p95 - p5
  
  // Estimate color temperature from average color
  // Warm images have more red, cool images have more blue
  const temperature = (avgR - avgB) / Math.max(avgR, avgB, 0.01)
  
  // Get dominant colors
  const sortedColors = Array.from(colorBuckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map(c => ({
      r: c.r,
      g: c.g,
      b: c.b,
      percentage: (c.count / pixelCount) * 100,
    }))
  
  // Normalize histogram
  const maxHistValue = Math.max(
    ...histogram.r, ...histogram.g, ...histogram.b, ...histogram.luminance
  )
  if (maxHistValue > 0) {
    histogram.r = histogram.r.map(v => v / maxHistValue)
    histogram.g = histogram.g.map(v => v / maxHistValue)
    histogram.b = histogram.b.map(v => v / maxHistValue)
    histogram.luminance = histogram.luminance.map(v => v / maxHistValue)
  }
  
  return {
    averageColor: { r: avgR, g: avgG, b: avgB },
    dominantColors: sortedColors,
    brightness: avgLuminance,
    contrast,
    saturation: avgSaturation,
    temperature,
    histogram,
  }
}

// Generate LUT parameters from image analysis
export function analysisToLUTParams(analysis: ImageAnalysis): {
  contrast: number
  saturation: number
  temperature: number
  tint: number
  shadows: number
  highlights: number
  lift: { r: number; g: number; b: number }
  gamma: { r: number; g: number; b: number }
  gain: { r: number; g: number; b: number }
} {
  // Convert analysis to LUT parameters
  // The idea is to create a LUT that transforms neutral footage to match the reference
  
  const { averageColor, brightness, contrast, saturation, temperature } = analysis
  
  // Calculate color offsets from neutral gray
  const neutralGray = { r: 0.5, g: 0.5, b: 0.5 }
  
  // Lift (shadows): based on the darkest parts of the image
  const lift = {
    r: (averageColor.r - neutralGray.r) * 0.3,
    g: (averageColor.g - neutralGray.g) * 0.3,
    b: (averageColor.b - neutralGray.b) * 0.3,
  }
  
  // Gamma (midtones): based on average color
  const gamma = {
    r: (averageColor.r - neutralGray.r) * 0.5,
    g: (averageColor.g - neutralGray.g) * 0.5,
    b: (averageColor.b - neutralGray.b) * 0.5,
  }
  
  // Gain (highlights): emphasize the dominant color channel
  const maxChannel = Math.max(averageColor.r, averageColor.g, averageColor.b)
  const gain = {
    r: (averageColor.r / maxChannel - 1) * 0.3,
    g: (averageColor.g / maxChannel - 1) * 0.3,
    b: (averageColor.b / maxChannel - 1) * 0.3,
  }
  
  // Contrast: map from 0-1 range to -0.5 to 0.5
  const contrastParam = (contrast - 0.5) * 0.6
  
  // Saturation: map from analysis
  const saturationParam = (saturation - 0.3) * 1.5
  
  // Temperature: already calculated
  const temperatureParam = temperature * 0.8
  
  // Tint: based on green-magenta balance
  const tintParam = (averageColor.g - (averageColor.r + averageColor.b) / 2) * 0.5
  
  // Shadows/Highlights: based on histogram distribution
  const shadowsParam = brightness < 0.4 ? -(0.4 - brightness) * 0.5 : 0
  const highlightsParam = brightness > 0.6 ? (brightness - 0.6) * 0.5 : 0
  
  return {
    contrast: Math.max(-1, Math.min(1, contrastParam)),
    saturation: Math.max(-1, Math.min(1, saturationParam)),
    temperature: Math.max(-1, Math.min(1, temperatureParam)),
    tint: Math.max(-1, Math.min(1, tintParam)),
    shadows: Math.max(-1, Math.min(1, shadowsParam)),
    highlights: Math.max(-1, Math.min(1, highlightsParam)),
    lift: {
      r: Math.max(-1, Math.min(1, lift.r)),
      g: Math.max(-1, Math.min(1, lift.g)),
      b: Math.max(-1, Math.min(1, lift.b)),
    },
    gamma: {
      r: Math.max(-1, Math.min(1, gamma.r)),
      g: Math.max(-1, Math.min(1, gamma.g)),
      b: Math.max(-1, Math.min(1, gamma.b)),
    },
    gain: {
      r: Math.max(-1, Math.min(1, gain.r)),
      g: Math.max(-1, Math.min(1, gain.g)),
      b: Math.max(-1, Math.min(1, gain.b)),
    },
  }
}

// Generate description from image analysis
export function generateAnalysisDescription(analysis: ImageAnalysis): string {
  const parts: string[] = []
  
  // Brightness
  if (analysis.brightness < 0.35) {
    parts.push('dark/low-key')
  } else if (analysis.brightness > 0.65) {
    parts.push('bright/high-key')
  }
  
  // Contrast
  if (analysis.contrast > 0.7) {
    parts.push('high contrast')
  } else if (analysis.contrast < 0.4) {
    parts.push('low contrast/flat')
  }
  
  // Saturation
  if (analysis.saturation > 0.5) {
    parts.push('vibrant/saturated')
  } else if (analysis.saturation < 0.2) {
    parts.push('desaturated/muted')
  }
  
  // Temperature
  if (analysis.temperature > 0.15) {
    parts.push('warm tones')
  } else if (analysis.temperature < -0.15) {
    parts.push('cool tones')
  }
  
  // Dominant colors
  if (analysis.dominantColors.length > 0) {
    const dominant = analysis.dominantColors[0]
    if (dominant.r > dominant.g && dominant.r > dominant.b) {
      parts.push('red/orange dominant')
    } else if (dominant.g > dominant.r && dominant.g > dominant.b) {
      parts.push('green dominant')
    } else if (dominant.b > dominant.r && dominant.b > dominant.g) {
      parts.push('blue/cyan dominant')
    }
  }
  
  return parts.length > 0 ? parts.join(', ') : 'balanced/neutral'
}
