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

export type LUTOutputFormat = 'standard' | 'hevc'

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

// Apply contrast curve
function applyContrast(value: number, contrast: number): number {
  const factor = (1 + contrast) / (1 - contrast * 0.99)
  return clamp((value - 0.5) * factor + 0.5)
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

// Apple HEVC uses "limited range" (16-235 in 8-bit) instead of full range (0-255)
// This causes colors to appear washed out when standard LUTs are applied
// These functions convert between limited and full range

// Convert from limited range (16-235) to full range (0-255) normalized
function limitedToFull(value: number): number {
  // Limited range: 16/255 = 0.0627, 235/255 = 0.9216
  // Expand to full 0-1 range
  return clamp((value - 0.0627) / (0.9216 - 0.0627))
}

// Convert from full range back to limited range
function fullToLimited(value: number): number {
  // Compress from full 0-1 range to limited range
  return clamp(value * (0.9216 - 0.0627) + 0.0627)
}

// Apple HEVC often uses a different gamma curve (approximately 1.96 vs standard 2.2)
// This compensates for the gamma difference
function applyHEVCGammaCompensation(value: number): number {
  // Convert from HEVC gamma (~1.96) to standard gamma (2.2)
  // This makes the image look correct when the LUT is applied to HEVC footage
  const hevcGamma = 1.96
  const standardGamma = 2.2
  
  // Linearize from HEVC gamma, then re-apply standard gamma
  const linear = Math.pow(Math.max(0, value), hevcGamma)
  return Math.pow(linear, 1 / standardGamma)
}

// Inverse HEVC gamma compensation (for output)
function applyInverseHEVCGammaCompensation(value: number): number {
  const hevcGamma = 1.96
  const standardGamma = 2.2
  
  // Convert standard gamma to linear, then apply HEVC gamma
  const linear = Math.pow(Math.max(0, value), standardGamma)
  return Math.pow(linear, 1 / hevcGamma)
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

// Transform color with HEVC compensation
// This handles the limited range and gamma differences in Apple's HEVC codec
export function transformColorHEVC(rIn: number, gIn: number, bIn: number, params: LUTParams): [number, number, number] {
  // Step 1: Convert from limited range to full range
  let r = limitedToFull(rIn)
  let g = limitedToFull(gIn)
  let b = limitedToFull(bIn)
  
  // Step 2: Apply HEVC gamma compensation
  r = applyHEVCGammaCompensation(r)
  g = applyHEVCGammaCompensation(g)
  b = applyHEVCGammaCompensation(b)
  
  // Step 3: Apply all the color grading transformations
  const [rGraded, gGraded, bGraded] = transformColor(r, g, b, params)
  
  // Step 4: Apply inverse gamma compensation for HEVC output
  r = applyInverseHEVCGammaCompensation(rGraded)
  g = applyInverseHEVCGammaCompensation(gGraded)
  b = applyInverseHEVCGammaCompensation(bGraded)
  
  // Step 5: Convert back to limited range
  r = fullToLimited(r)
  g = fullToLimited(g)
  b = fullToLimited(b)
  
  return [r, g, b]
}

// Generate .cube file content
export function generateCubeLUT(
  params: LUTParams, 
  title: string = 'Generated LUT', 
  size: number = 33,
  format: LUTOutputFormat = 'standard'
): string {
  const lines: string[] = []
  
  // Header
  lines.push(`TITLE "${title}"`)
  lines.push('')
  lines.push('# Generated by LUT Generator')
  if (format === 'hevc') {
    lines.push('# HEVC-Compatible: Optimized for Apple HEVC/H.265 footage')
    lines.push('# Compensates for limited range (16-235) and gamma differences')
  }
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
        
        const [rOut, gOut, bOut] = format === 'hevc' 
          ? transformColorHEVC(rIn, gIn, bIn, params)
          : transformColor(rIn, gIn, bIn, params)
        
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
