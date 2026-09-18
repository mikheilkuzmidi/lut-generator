// LUT Generator Library
// Generates proper .cube format LUT files

export interface LUTParams {
  contrast: number      // -1 to 1
  saturation: number    // -1 to 1
  temperature: number   // -1 (cool) to 1 (warm)
  tint: number          // -1 (green) to 1 (magenta)
  shadows: number       // -1 to 1
  highlights: number    // -1 to 1
  lift: { r: number; g: number; b: number }    // RGB lift (shadows)
  gamma: { r: number; g: number; b: number }   // RGB gamma (midtones)
  gain: { r: number; g: number; b: number }    // RGB gain (highlights)
}

export const defaultParams: LUTParams = {
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  shadows: 0,
  highlights: 0,
  lift: { r: 0, g: 0, b: 0 },
  gamma: { r: 0, g: 0, b: 0 },
  gain: { r: 0, g: 0, b: 0 },
}

// Clamp value between 0 and 1
function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

// The steepest contrast curve a 3D LUT can actually carry.
//
// A LUT is a grid, and a grid can only represent a curve that is smooth
// relative to its spacing. (1 + c) / (1 - c * 0.99) reaches 200 at c = 1,
// which is a step function pivoting at 0.5 with a transition band about
// 0.0025 wide. A 33 point grid has a spacing of 0.031, so it steps straight
// over that band and the file it writes is not the grade that was asked for:
// measured, a pixel that should have been crushed to black came back at 87
// out of 255 through the exported .cube, and at 107 through the preview.
//
// Capping the factor at 4 leaves a transition band of 0.25, which is eight
// grid points wide at size 33, so interpolation represents it faithfully.
// The cap engages only above c = 0.605, and the steepest preset that ships
// is 0.35, so every shipped look is bit for bit what it was.
const MAX_CONTRAST_FACTOR = 4

function applyContrast(value: number, contrast: number): number {
  const factor = Math.min((1 + contrast) / (1 - contrast * 0.99), MAX_CONTRAST_FACTOR)
  return clamp((value - 0.5) * factor + 0.5)
}

export function assertGridSize(size: number): void {
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError(`LUT size must be an integer of 2 or more, got ${size}`)
  }
}

// Apply saturation
function applySaturation(r: number, g: number, b: number, saturation: number): [number, number, number] {
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b
  const factor = 1 + saturation
  return [
    clamp(luminance + (r - luminance) * factor),
    clamp(luminance + (g - luminance) * factor),
    clamp(luminance + (b - luminance) * factor),
  ]
}

// Apply temperature and tint (simplified color temperature)
function applyTemperature(r: number, g: number, b: number, temp: number, tint: number): [number, number, number] {
  // Temperature: warm adds red/yellow, cool adds blue
  // Tint: positive adds magenta, negative adds green
  const tempFactor = temp * 0.1
  const tintFactor = tint * 0.05
  
  return [
    clamp(r + tempFactor),
    clamp(g - tintFactor),
    clamp(b - tempFactor),
  ]
}

// Apply lift/gamma/gain (color wheels)
function applyLiftGammaGain(
  r: number, g: number, b: number,
  lift: { r: number; g: number; b: number },
  gamma: { r: number; g: number; b: number },
  gain: { r: number; g: number; b: number }
): [number, number, number] {
  // Lift affects shadows (adds offset)
  // Gamma affects midtones (power function)
  // Gain affects highlights (multiplier)
  
  const liftScale = 0.1
  const gammaScale = 0.2
  const gainScale = 0.2
  
  const applyChannel = (value: number, liftVal: number, gammaVal: number, gainVal: number): number => {
    // Apply lift (offset)
    let result = value + liftVal * liftScale * (1 - value)
    
    // Apply gamma (power curve for midtones)
    const gammaPower = 1 / (1 + gammaVal * gammaScale)
    result = Math.pow(Math.max(0, result), gammaPower)
    
    // Apply gain (multiply highlights)
    result = result * (1 + gainVal * gainScale)
    
    return clamp(result)
  }
  
  return [
    applyChannel(r, lift.r, gamma.r, gain.r),
    applyChannel(g, lift.g, gamma.g, gain.g),
    applyChannel(b, lift.b, gamma.b, gain.b),
  ]
}

// Apply shadows/highlights adjustment
function applyShadowsHighlights(r: number, g: number, b: number, shadows: number, highlights: number): [number, number, number] {
  const applyChannel = (value: number): number => {
    // Shadows affect dark areas
    if (value < 0.5 && shadows !== 0) {
      const shadowMask = 1 - (value / 0.5)
      value = clamp(value + shadows * 0.15 * shadowMask)
    }
    
    // Highlights affect bright areas
    if (value > 0.5 && highlights !== 0) {
      const highlightMask = (value - 0.5) / 0.5
      value = clamp(value + highlights * 0.15 * highlightMask)
    }
    
    return value
  }
  
  return [applyChannel(r), applyChannel(g), applyChannel(b)]
}

// Transform a single color through the LUT parameters
export function transformColor(rIn: number, gIn: number, bIn: number, params: LUTParams): [number, number, number] {
  let r = rIn
  let g = gIn
  let b = bIn

  // Apply in order: lift/gamma/gain, shadows/highlights, temperature, contrast, saturation
  
  // 1. Lift/Gamma/Gain (color wheels)
  const lgg = applyLiftGammaGain(r, g, b, params.lift, params.gamma, params.gain)
  r = lgg[0]
  g = lgg[1]
  b = lgg[2]
  
  // 2. Shadows/Highlights
  const sh = applyShadowsHighlights(r, g, b, params.shadows, params.highlights)
  r = sh[0]
  g = sh[1]
  b = sh[2]
  
  // 3. Temperature and Tint
  const temp = applyTemperature(r, g, b, params.temperature, params.tint)
  r = temp[0]
  g = temp[1]
  b = temp[2]
  
  // 4. Contrast
  r = applyContrast(r, params.contrast)
  g = applyContrast(g, params.contrast)
  b = applyContrast(b, params.contrast)
  
  // 5. Saturation
  const sat = applySaturation(r, g, b, params.saturation)
  r = sat[0]
  g = sat[1]
  b = sat[2]
  
  return [r, g, b]
}


// Generate .cube file content
export function generateCubeLUT(
  params: LUTParams,
  title: string = 'Generated LUT',
  size: number = 33
): string {
  // A grid needs two points per axis to have any spacing at all. At size 1
  // every coordinate is 0/(size-1) = 0/0, and this wrote the literal text
  // "NaN NaN NaN" into the file. Nothing downstream can recover from that, so
  // it fails here instead.
  assertGridSize(size)

  const lines: string[] = []
  
  // Header
  lines.push(`TITLE "${title}"`)
  lines.push('')
  lines.push('# Generated by LUT Generator')
  lines.push('# Compatible with: Final Cut Pro, Premiere Pro, DaVinci Resolve, After Effects')
  lines.push('')
  lines.push(`LUT_3D_SIZE ${size}`)
  lines.push('')
  lines.push('DOMAIN_MIN 0.0 0.0 0.0')
  lines.push('DOMAIN_MAX 1.0 1.0 1.0')
  lines.push('')
  
  // Generate 3D LUT data
  // Red varies fastest, then Green, then Blue (red major order)
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const rIn = r / (size - 1)
        const gIn = g / (size - 1)
        const bIn = b / (size - 1)
        
        const [rOut, gOut, bOut] = transformColor(rIn, gIn, bIn, params)
        
        // Format: 6 decimal places, space-separated
        lines.push(`${rOut.toFixed(6)} ${gOut.toFixed(6)} ${bOut.toFixed(6)}`)
      }
    }
  }
  
  return lines.join('\n')
}

// Preset LUTs for common styles
export const presets: Record<string, LUTParams> = {
  'cinematic-orange-teal': {
    ...defaultParams,
    contrast: 0.15,
    saturation: 0.1,
    temperature: 0.2,
    tint: 0.05,
    shadows: -0.1,
    highlights: 0.1,
    lift: { r: 0, g: -0.1, b: 0.1 },
    gamma: { r: 0.05, g: 0, b: -0.05 },
    gain: { r: 0.1, g: 0.05, b: -0.1 },
  },
  'vintage-film': {
    ...defaultParams,
    contrast: 0.1,
    saturation: -0.15,
    temperature: 0.1,
    shadows: 0.1,
    highlights: -0.1,
    lift: { r: 0.1, g: 0.05, b: 0 },
    gamma: { r: 0, g: 0, b: 0 },
    gain: { r: -0.05, g: -0.05, b: -0.1 },
  },
  'black-and-white': {
    ...defaultParams,
    saturation: -1,
    contrast: 0.2,
  },
  'high-contrast': {
    ...defaultParams,
    contrast: 0.35,
    saturation: 0.1,
    shadows: -0.15,
    highlights: 0.15,
  },
  'muted-pastel': {
    ...defaultParams,
    saturation: -0.25,
    contrast: -0.1,
    highlights: 0.1,
    lift: { r: 0.05, g: 0.05, b: 0.08 },
  },
  'warm-golden': {
    ...defaultParams,
    temperature: 0.3,
    saturation: 0.1,
    contrast: 0.05,
    gain: { r: 0.1, g: 0.05, b: -0.1 },
  },
  'cool-blue': {
    ...defaultParams,
    temperature: -0.3,
    saturation: 0.05,
    tint: -0.1,
    gain: { r: -0.1, g: 0, b: 0.15 },
  },
  'vibrant-pop': {
    ...defaultParams,
    saturation: 0.4,
    contrast: 0.15,
    highlights: 0.1,
  },
}
