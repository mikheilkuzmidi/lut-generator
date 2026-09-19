'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { applyParams } from '@/lib/lut-apply'
import { computeHistogram, histogramStats, normalizeHistogram } from '@/lib/histogram'
import type { LUTParams } from '@/lib/lut-generator'

// Mountains and boats, which is what camera makers shoot their own sensor
// tests on: snow, water, sky and paint cover blown highlights, specular
// clipping, a wide neutral range and a saturated primary between them. Every
// file is CC0 or public domain, so it can ship inside this repository. See
// public/samples/CREDITS.md for the per file credit.
export const SAMPLES = [
  { file: 'mountain-snow.jpg', label: 'Snow and fog', tests: 'blown highlights, almost no chroma' },
  { file: 'peak-sunset.jpg', label: 'Peak at dusk', tests: 'deep shadow against a warm horizon' },
  { file: 'mountain-lake.jpg', label: 'Lake reflection', tests: 'greens, and a mirrored tonal range' },
  { file: 'harbour-boats.jpg', label: 'Harbour boat', tests: 'saturated cyan paint' },
  { file: 'sailboat-sea.jpg', label: 'Specular water', tests: 'already clipped before you touch it' },
  { file: 'sailboat-fog.jpg', label: 'Boat in fog', tests: 'near monochrome, very low contrast' },
] as const

// Wide enough to judge a grade on, small enough that a slider drag stays
// responsive: applyLUT walks every pixel on every parameter change.
const PREVIEW_WIDTH = 720

/**
 * `sample` is part of this on purpose.
 *
 * Clearing the previous decode used to be a `setDecoded(null)` at the top of
 * the effect that starts the next one, which is a synchronous setState inside
 * an effect body and a cascading render every time the sample changes.
 * Carrying the filename instead makes "this decode is for the picture we are
 * no longer showing" something the render can see, so nothing has to be reset
 * on the way in.
 */
type Loaded = { sample: string; bitmap: ImageBitmap; width: number; height: number }

export function LutPreview({
  params,
  enabled,
}: {
  params: LUTParams
  enabled: boolean
}) {
  const [sample, setSample] = useState<string>(SAMPLES[0].file)
  const [decoded, setDecoded] = useState<Loaded | null>(null)
  const [split, setSplit] = useState(0.5)
  const [showHistogram, setShowHistogram] = useState(false)
  const [clipping, setClipping] = useState<{ black: number; white: number } | null>(null)
  // The decode that belongs to the picture currently selected. A decode for a
  // previous sample reads as "not loaded yet", which is what it is.
  const loaded = decoded?.sample === sample ? decoded : null

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const histRef = useRef<HTMLCanvasElement>(null)
  const sourceRef = useRef<ImageData | null>(null)
  const frameRef = useRef<number | null>(null)

  // Decode once per sample. The graded pixels are recomputed on every
  // parameter change, so the decode must not be in that path.
  useEffect(() => {
    let cancelled = false
    fetch(`/samples/${sample}`)
      .then((r) => r.blob())
      .then((blob) => createImageBitmap(blob))
      .then((bitmap) => {
        if (cancelled) return
        const scale = PREVIEW_WIDTH / bitmap.width
        setDecoded({ sample, bitmap, width: PREVIEW_WIDTH, height: Math.round(bitmap.height * scale) })
      })
      .catch(() => {
        if (!cancelled) setDecoded(null)
      })
    return () => {
      cancelled = true
    }
  }, [sample])

  // Read the ungraded pixels once, at preview size, into a buffer the grade
  // reads from. Reading them back out of the canvas each time would mean
  // grading an already graded image.
  useEffect(() => {
    if (!loaded || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = loaded.width
    canvas.height = loaded.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(loaded.bitmap, 0, 0, loaded.width, loaded.height)
    sourceRef.current = ctx.getImageData(0, 0, loaded.width, loaded.height)
  }, [loaded])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const source = sourceRef.current
    if (!canvas || !source || !loaded) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    // applyParams returns a plain { data, width, height }, deliberately: that
    // is what makes it testable in node with no canvas. putImageData only
    // accepts a real ImageData instance, so the bytes are copied into one the
    // context made. Passing the plain object straight in throws
    // "parameter 1 is not of type 'ImageData'".
    const graded = enabled
      ? applyParams(source as unknown as Parameters<typeof applyParams>[0], params)
      : source

    const frame = ctx.createImageData(loaded.width, loaded.height)
    frame.data.set(graded.data)
    ctx.putImageData(frame, 0, 0)

    // The split is drawn by painting the ungraded original back over the left
    // portion, so both halves are the same pixels at the same scale and the
    // comparison is honest.
    if (enabled && split > 0) {
      const cut = Math.round(loaded.width * split)
      if (cut > 0) {
        // Row by row, because the buffer is row major over the full width: a
        // single slice of the first cut*height*4 bytes would take whole rows
        // from the top of the image rather than a column from every row.
        const strip = ctx.createImageData(cut, loaded.height)
        for (let y = 0; y < loaded.height; y++) {
          const from = y * loaded.width * 4
          strip.data.set(source.data.subarray(from, from + cut * 4), y * cut * 4)
        }
        ctx.putImageData(strip, 0, 0)
      }
    }

    const h = computeHistogram(graded as unknown as Parameters<typeof computeHistogram>[0])
    const stats = histogramStats(h)
    setClipping({ black: stats.clippedBlackFraction, white: stats.clippedWhiteFraction })

    if (showHistogram && histRef.current) {
      const hc = histRef.current
      const norm = normalizeHistogram(h)
      // Sized to the element rather than to a fixed 360, or the canvas is
      // drawn at one width and stretched to another, which is a blurry
      // histogram on a tool whose whole job is looking closely at an image.
      const dpr = window.devicePixelRatio || 1
      const cssWidth = hc.clientWidth || 360
      const cssHeight = 96
      hc.width = Math.round(cssWidth * dpr)
      hc.height = Math.round(cssHeight * dpr)
      hc.style.height = `${cssHeight}px`
      const hctx = hc.getContext('2d')
      if (hctx) {
        hctx.scale(dpr, dpr)
        hctx.clearRect(0, 0, cssWidth, cssHeight)
        const channels: [Float64Array, string][] = [
          [norm.red, 'rgba(248,113,113,0.7)'],
          [norm.green, 'rgba(74,222,128,0.7)'],
          [norm.blue, 'rgba(96,165,250,0.7)'],
        ]
        hctx.globalCompositeOperation = 'lighter'
        const barWidth = cssWidth / norm.bins
        for (const [bins, colour] of channels) {
          hctx.fillStyle = colour
          for (let i = 0; i < bins.length; i++) {
            // Square root, not linear. A frame with 6 percent of its pixels
            // pinned at black puts a spike in bin 0 that is an order of
            // magnitude taller than anything else, and against a linear scale
            // that flattens the entire rest of the distribution to one pixel.
            // Every grading tool scales its histogram for the same reason.
            const bh = Math.sqrt(bins[i]) * cssHeight
            hctx.fillRect(i * barWidth, cssHeight - bh, barWidth + 0.5, bh)
          }
        }
      }
    }
  }, [enabled, loaded, params, showHistogram, split])

  // Coalesce to one draw per animation frame: dragging a slider fires change
  // events far faster than a 720px grade completes.
  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(draw)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [draw])

  const active = SAMPLES.find((s) => s.file === sample) ?? SAMPLES[0]

  return (
    <div className="border border-border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium">Preview</p>
          <p className="text-xs text-muted">{active.tests}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistogram((v) => !v)}
          className="text-xs px-2.5 py-1.5 border border-border rounded-md hover:bg-card-hover transition-colors"
        >
          {showHistogram ? 'Hide histogram' : 'Show histogram'}
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col justify-center">
      <div className="relative rounded-md overflow-hidden bg-card mb-3">
        <canvas ref={canvasRef} className="w-full block" />
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted">
            Loading sample
          </div>
        )}
        {enabled && loaded && (
          <>
            <div
              className="absolute top-0 bottom-0 w-px bg-white/70 pointer-events-none"
              style={{ left: `${split * 100}%` }}
            />
            <span className="absolute top-2 left-2 text-[10px] uppercase tracking-wider bg-black/55 text-white px-1.5 py-0.5 rounded">
              before
            </span>
            <span className="absolute top-2 right-2 text-[10px] uppercase tracking-wider bg-black/55 text-white px-1.5 py-0.5 rounded">
              after
            </span>
          </>
        )}
      </div>

      {enabled && (
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(split * 100)}
          onChange={(e) => setSplit(Number(e.target.value) / 100)}
          aria-label="Before and after split"
          className="w-full mb-3"
        />
      )}

      {showHistogram && (
        <canvas ref={histRef} className="w-full rounded-md bg-card mb-3 block" style={{ height: 96 }} />
      )}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 shrink-0">
        {SAMPLES.map((s) => (
          <button
            key={s.file}
            type="button"
            onClick={() => setSample(s.file)}
            aria-pressed={s.file === sample}
            className={`text-left px-2.5 py-2 rounded-md border text-xs transition-colors ${
              s.file === sample ? 'border-foreground bg-card' : 'border-border hover:bg-card-hover'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted">
        {clipping && (clipping.black > 0.002 || clipping.white > 0.002) ? (
          <>
            Clipping: {(clipping.black * 100).toFixed(1)}% at black,{' '}
            {(clipping.white * 100).toFixed(1)}% at white. Detail at those ends is gone, not
            recoverable.
          </>
        ) : (
          <>No clipping. Samples are CC0 or public domain.</>
        )}
      </p>
    </div>
  )
}
