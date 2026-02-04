'use client'

import { useState, useRef, useCallback } from 'react'
import { 
  IconUpload, IconDownload, IconImage, IconSliders, 
  IconSpinner, IconCheck, IconInfo, IconChevronDown, IconPalette,
  IconCube, IconFilm, IconCopy, IconPlay
} from '@/components/icons'
import { analyzeImageData, analysisToLUTParams, generateAnalysisDescription, type ImageAnalysis } from '@/lib/image-analysis'
import { generateCubeLUT, defaultParams, presets, type LUTParams, type LUTOutputFormat } from '@/lib/lut-generator'

type GenerationMode = 'image' | 'preset' | 'manual'

interface GenerationResult {
  lutContent: string
  params: LUTParams
  description: string
  filename: string
  format: LUTOutputFormat
}

export default function Home() {
  const [mode, setMode] = useState<GenerationMode>('preset')
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysis | null>(null)
  const [uploadedImage, setUploadedImage] = useState<string | null>(null)
  const [showInstructions, setShowInstructions] = useState(false)
  const [manualParams, setManualParams] = useState<LUTParams>(defaultParams)
  const [copied, setCopied] = useState(false)
  const [outputFormat, setOutputFormat] = useState<LUTOutputFormat>('standard')
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const presetOptions = [
    { value: 'cinematic-orange-teal', label: 'Cinematic Orange & Teal' },
    { value: 'vintage-film', label: 'Vintage Film' },
    { value: 'black-and-white', label: 'Black & White' },
    { value: 'high-contrast', label: 'High Contrast' },
    { value: 'muted-pastel', label: 'Muted Pastel' },
    { value: 'warm-golden', label: 'Warm Golden Hour' },
    { value: 'cool-blue', label: 'Cool Blue' },
    { value: 'vibrant-pop', label: 'Vibrant Pop' },
  ]

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        setUploadedImage(event.target?.result as string)
        
        // Analyze the image
        const canvas = canvasRef.current
        if (!canvas) return
        
        // Resize for analysis (max 256px for performance)
        const maxSize = 256
        const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
        canvas.width = img.width * scale
        canvas.height = img.height * scale
        
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        
        const analysis = analyzeImageData(imageData)
        setImageAnalysis(analysis)
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }, [])

  const generateLUT = async () => {
    setIsGenerating(true)
    setError(null)
    setResult(null)

    try {
      let lutContent: string
      let params: LUTParams
      let description: string
      let filename: string

      if (mode === 'image' && imageAnalysis) {
        // Generate from image analysis
        const analysisParams = analysisToLUTParams(imageAnalysis)
        params = { ...defaultParams, ...analysisParams }
        const analysisDesc = generateAnalysisDescription(imageAnalysis)
        const formatLabel = outputFormat === 'hevc' ? ' (HEVC)' : ''
        description = `Generated from image${formatLabel}: ${analysisDesc}`
        filename = `image-lut${outputFormat === 'hevc' ? '-hevc' : ''}-${Date.now()}.cube`
        lutContent = generateCubeLUT(params, `Image Reference LUT${formatLabel} - ${analysisDesc}`, 33, outputFormat)
      } else if (mode === 'preset' && selectedPreset) {
        // Use preset
        params = presets[selectedPreset]
        const formatLabel = outputFormat === 'hevc' ? ' (HEVC)' : ''
        description = `Preset${formatLabel}: ${presetOptions.find(p => p.value === selectedPreset)?.label}`
        filename = `${selectedPreset}${outputFormat === 'hevc' ? '-hevc' : ''}.cube`
        const presetTitle = presetOptions.find(p => p.value === selectedPreset)?.label || selectedPreset
        lutContent = generateCubeLUT(params, `${presetTitle}${formatLabel}`, 33, outputFormat)
      } else if (mode === 'manual') {
        // Use manual parameters
        params = manualParams
        const formatLabel = outputFormat === 'hevc' ? ' (HEVC)' : ''
        description = `Custom manual parameters${formatLabel}`
        filename = `custom-lut${outputFormat === 'hevc' ? '-hevc' : ''}-${Date.now()}.cube`
        lutContent = generateCubeLUT(params, `Custom LUT${formatLabel}`, 33, outputFormat)
      } else {
        throw new Error('Please provide input for generation')
      }

      setResult({ lutContent, params, description, filename, format: outputFormat })
    } catch (err) {
      console.error('Error generating LUT', err)

      let message = 'An unexpected error occurred while generating the LUT.'

      if (err instanceof Error) {
        if (err.message.toLowerCase().includes("can't assign to property 0 on 0")) {
          message = 'Your browser hit a low-level error while generating the LUT. Please try again or use a different browser.'
        } else {
          message = err.message || message
        }
      }

      setError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadLUT = () => {
    if (!result) return
    
    const blob = new Blob([result.lutContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const copyToClipboard = async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.lutContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const updateManualParam = (key: string, value: number | { r: number; g: number; b: number }) => {
    setManualParams(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="min-h-screen">
      {/* Hidden canvas for image analysis */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconCube className="w-8 h-8" />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">LUT Generator</h1>
              <p className="text-sm text-muted">Create professional .cube LUTs</p>
            </div>
          </div>
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-border rounded-lg hover:bg-card-hover transition-colors"
          >
            <IconFilm className="w-4 h-4" />
            <span>How to Use LUTs</span>
            <IconChevronDown className={`w-4 h-4 transition-transform ${showInstructions ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </header>

      {/* Instructions Panel */}
      {showInstructions && (
        <div className="border-b border-border bg-card animate-slide-up">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <h2 className="text-lg font-semibold mb-6">How to Use .cube LUTs in Your Editing Software</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Final Cut Pro */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src="/logos/final-cut-pro.png"
                    alt="Final Cut Pro logo"
                    className="w-8 h-8 object-contain"
                  />
                  <h3 className="font-medium">Final Cut Pro</h3>
                </div>
                <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
                  <li>Open Effects Browser</li>
                  <li>Search for "Custom LUT"</li>
                  <li>Drag effect to your clip</li>
                  <li>In Inspector, click LUT dropdown</li>
                  <li>Choose "Choose Custom LUT"</li>
                  <li>Select your .cube file</li>
                </ol>
              </div>
              
              {/* Premiere Pro */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src="/logos/premiere-pro.png"
                    alt="Premiere Pro logo"
                    className="w-8 h-8 object-contain"
                  />
                  <h3 className="font-medium">Premiere Pro</h3>
                </div>
                <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
                  <li>Select your clip</li>
                  <li>Open Lumetri Color panel</li>
                  <li>Go to Creative tab</li>
                  <li>Click "Look" dropdown</li>
                  <li>Select "Browse"</li>
                  <li>Choose your .cube file</li>
                  <li>Adjust Intensity as needed</li>
                </ol>
              </div>
              
              {/* DaVinci Resolve */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src="/logos/davinci-resolve.png"
                    alt="DaVinci Resolve logo"
                    className="w-8 h-8 object-contain"
                  />
                  <h3 className="font-medium">DaVinci Resolve</h3>
                </div>
                <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
                  <li>Go to Project Settings</li>
                  <li>Select Color Management</li>
                  <li>Click "Open LUT Folder"</li>
                  <li>Copy .cube file there</li>
                  <li>Click "Update Lists"</li>
                  <li>In Color tab, right-click node</li>
                  <li>Choose LUTs → 3D LUT</li>
                </ol>
              </div>
              
              {/* After Effects */}
              <div className="p-4 border border-border rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src="/logos/after-effects.png"
                    alt="After Effects logo"
                    className="w-8 h-8 object-contain"
                  />
                  <h3 className="font-medium">After Effects</h3>
                </div>
                <ol className="text-sm text-muted space-y-1.5 list-decimal list-inside">
                  <li>Select your layer</li>
                  <li>Effect → Color Correction</li>
                  <li>Apply "Lumetri Color"</li>
                  <li>In Creative section</li>
                  <li>Click "Look" dropdown</li>
                  <li>Browse to .cube file</li>
                </ol>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-card-hover rounded-lg">
              <div className="flex items-start gap-3">
                <IconInfo className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-muted">
                  <p className="font-medium text-foreground mb-1">Pro Tips</p>
                  <ul className="space-y-1">
                    <li>Always work on adjustment layers when applying LUTs for non-destructive editing</li>
                    <li>The .cube format is universally supported across all major video editing software</li>
                    <li>Start with 50-70% intensity and adjust to taste</li>
                    <li>LUTs work best on properly exposed, color-balanced footage</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left: Input */}
          <div className="space-y-8">
            {/* Mode Selection */}
            <div>
              <label className="block text-sm font-medium mb-3">Generation Mode</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'image', icon: IconImage, label: 'Reference' },
                  { id: 'preset', icon: IconPalette, label: 'Presets' },
                  { id: 'manual', icon: IconSliders, label: 'Manual' },
                ].map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    onClick={() => setMode(id as GenerationMode)}
                    className={`flex flex-col items-center gap-2 p-4 border rounded-lg transition-all ${
                      mode === id 
                        ? 'border-foreground bg-foreground text-background' 
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Image Upload */}
            {mode === 'image' && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium mb-2">
                  Upload Reference Image
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-48 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-3 hover:border-muted-foreground transition-colors"
                >
                  {uploadedImage ? (
                    <img src={uploadedImage} alt="Reference" className="max-h-40 object-contain rounded" />
                  ) : (
                    <>
                      <IconUpload className="w-8 h-8 text-muted" />
                      <span className="text-sm text-muted">Click to upload or drag and drop</span>
                      <span className="text-xs text-muted-foreground">PNG, JPG, WEBP up to 10MB</span>
                    </>
                  )}
                </button>
                {imageAnalysis && (
                  <div className="mt-4 p-4 bg-card border border-border rounded-lg">
                    <p className="text-sm font-medium mb-2">Image Analysis</p>
                    <p className="text-sm text-muted">{generateAnalysisDescription(imageAnalysis)}</p>
                    <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                      <span>Brightness: {(imageAnalysis.brightness * 100).toFixed(0)}%</span>
                      <span>Contrast: {(imageAnalysis.contrast * 100).toFixed(0)}%</span>
                      <span>Saturation: {(imageAnalysis.saturation * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Preset Selection */}
            {mode === 'preset' && (
              <div className="animate-fade-in">
                <label className="block text-sm font-medium mb-2">
                  Choose a Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {presetOptions.map((preset) => (
                    <button
                      key={preset.value}
                      onClick={() => setSelectedPreset(preset.value)}
                      className={`p-4 text-left border rounded-lg transition-all ${
                        selectedPreset === preset.value
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border hover:border-muted-foreground'
                      }`}
                    >
                      <span className="text-sm font-medium">{preset.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual Controls */}
            {mode === 'manual' && (
              <div className="animate-fade-in space-y-4">
                <label className="block text-sm font-medium">
                  Adjust Parameters
                </label>
                
                {/* Basic adjustments */}
                <div className="space-y-3">
                  {[
                    { key: 'contrast', label: 'Contrast' },
                    { key: 'saturation', label: 'Saturation' },
                    { key: 'temperature', label: 'Temperature' },
                    { key: 'tint', label: 'Tint' },
                    { key: 'shadows', label: 'Shadows' },
                    { key: 'highlights', label: 'Highlights' },
                  ].map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-4">
                      <span className="w-24 text-sm text-muted">{label}</span>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        value={(manualParams[key as keyof LUTParams] as number) * 100}
                        onChange={(e) => updateManualParam(key, parseFloat(e.target.value) / 100)}
                        className="flex-1 h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
                      />
                      <span className="w-12 text-right text-sm font-mono">
                        {((manualParams[key as keyof LUTParams] as number) * 100).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* RGB Controls */}
                <div className="pt-4 border-t border-border">
                  <p className="text-sm font-medium mb-3">Color Wheels (RGB)</p>
                  {['lift', 'gamma', 'gain'].map((wheel) => (
                    <div key={wheel} className="mb-4">
                      <p className="text-xs text-muted mb-2 capitalize">{wheel} (Shadows/Midtones/Highlights)</p>
                      <div className="grid grid-cols-3 gap-2">
                        {['r', 'g', 'b'].map((channel) => (
                          <div key={channel} className="flex items-center gap-2">
                            <span className="text-xs uppercase text-muted-foreground w-3">{channel}</span>
                            <input
                              type="range"
                              min="-100"
                              max="100"
                              value={(manualParams[wheel as 'lift' | 'gamma' | 'gain'][channel as 'r' | 'g' | 'b']) * 100}
                              onChange={(e) => {
                                const currentWheel = manualParams[wheel as 'lift' | 'gamma' | 'gain']
                                updateManualParam(wheel, {
                                  ...currentWheel,
                                  [channel]: parseFloat(e.target.value) / 100
                                })
                              }}
                              className="flex-1 h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2 [&::-webkit-slider-thumb]:h-2 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Output Format Selection */}
            <div className="p-4 border border-border rounded-lg">
              <label className="block text-sm font-medium mb-3">Output Format</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOutputFormat('standard')}
                  className={`p-3 text-left border rounded-lg transition-all ${
                    outputFormat === 'standard'
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <span className="text-sm font-medium block">Standard</span>
                  <span className="text-xs opacity-70">H.264, ProRes, etc.</span>
                </button>
                <button
                  onClick={() => setOutputFormat('hevc')}
                  className={`p-3 text-left border rounded-lg transition-all ${
                    outputFormat === 'hevc'
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border hover:border-muted-foreground'
                  }`}
                >
                  <span className="text-sm font-medium block">Apple HEVC</span>
                  <span className="text-xs opacity-70">iPhone, iPad, Mac</span>
                </button>
              </div>
              {outputFormat === 'hevc' && (
                <p className="mt-2 text-xs text-muted">
                  Optimized for Apple HEVC/H.265 footage. Compensates for limited range and gamma differences.
                </p>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={generateLUT}
              disabled={isGenerating || (mode === 'image' && !imageAnalysis) || (mode === 'preset' && !selectedPreset)}
              className="w-full py-4 bg-foreground text-background font-medium rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <IconSpinner className="w-5 h-5" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <IconPlay className="w-5 h-5" />
                  <span>Generate LUT</span>
                </>
              )}
            </button>

            {error && (
              <div className="p-4 bg-card border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Right: Output */}
          <div className="space-y-6">
            <div className="p-6 border border-border rounded-lg min-h-[400px] flex flex-col">
              {result ? (
                <div className="animate-fade-in flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <IconCheck className="w-5 h-5 text-green-400" />
                    <span className="font-medium">LUT Generated Successfully</span>
                  </div>
                  
                  <p className="text-sm text-muted mb-4">{result.description}</p>
                  
                  {/* Parameters Preview */}
                  <div className="flex-1 p-4 bg-card rounded-lg mb-4 overflow-auto">
                    <p className="text-xs text-muted-foreground mb-2 font-mono">Parameters:</p>
                    <pre className="text-xs font-mono text-muted whitespace-pre-wrap">
{`Contrast: ${(result.params.contrast * 100).toFixed(0)}%
Saturation: ${(result.params.saturation * 100).toFixed(0)}%
Temperature: ${(result.params.temperature * 100).toFixed(0)}%
Tint: ${(result.params.tint * 100).toFixed(0)}%
Shadows: ${(result.params.shadows * 100).toFixed(0)}%
Highlights: ${(result.params.highlights * 100).toFixed(0)}%
Lift RGB: (${(result.params.lift.r * 100).toFixed(0)}, ${(result.params.lift.g * 100).toFixed(0)}, ${(result.params.lift.b * 100).toFixed(0)})
Gamma RGB: (${(result.params.gamma.r * 100).toFixed(0)}, ${(result.params.gamma.g * 100).toFixed(0)}, ${(result.params.gamma.b * 100).toFixed(0)})
Gain RGB: (${(result.params.gain.r * 100).toFixed(0)}, ${(result.params.gain.g * 100).toFixed(0)}, ${(result.params.gain.b * 100).toFixed(0)})`}
                    </pre>
                  </div>
                  
                  {/* File info */}
                  <div className="flex items-center justify-between p-3 bg-card rounded-lg mb-4">
                    <div className="flex items-center gap-3">
                      <IconCube className="w-5 h-5 text-muted" />
                      <div>
                        <p className="text-sm font-medium">{result.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          33x33x33 3D LUT {result.format === 'hevc' && '• HEVC-Compatible'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {(result.lutContent.length / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={downloadLUT}
                      className="flex-1 py-3 bg-foreground text-background font-medium rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                    >
                      <IconDownload className="w-5 h-5" />
                      <span>Download .cube</span>
                    </button>
                    <button
                      onClick={copyToClipboard}
                      className="px-4 py-3 border border-border rounded-lg flex items-center justify-center gap-2 hover:bg-card-hover transition-colors"
                    >
                      {copied ? <IconCheck className="w-5 h-5" /> : <IconCopy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <IconCube className="w-16 h-16 text-border mb-4" />
                  <p className="text-muted">Your generated LUT will appear here</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Choose a mode and generate to get started
                  </p>
                </div>
              )}
            </div>

            {/* Format info */}
            <div className="p-4 border border-border rounded-lg">
              <div className="flex items-start gap-3">
                <IconInfo className="w-5 h-5 mt-0.5 flex-shrink-0 text-muted" />
                <div className="text-sm text-muted">
                  <p className="font-medium text-foreground mb-1">About .cube Format</p>
                  <p>
                    The .cube format is an industry-standard 3D LUT file format created by Adobe. 
                    It stores color transformation data as RGB values from 0.0 to 1.0 in a 33x33x33 grid, 
                    providing 35,937 color mapping points for smooth, accurate color grading.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12">
        <div className="max-w-6xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground">
          <p>LUT Generator creates valid, non-corrupted .cube files compatible with all major editing software.</p>
          <p className="mt-1">Final Cut Pro / Premiere Pro / DaVinci Resolve / After Effects / Avid Media Composer / LumaFusion</p>
        </div>
      </footer>
    </div>
  )
}
