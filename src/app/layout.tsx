import type { Metadata } from 'next'
import { Instrument_Sans, Geist_Mono } from 'next/font/google'
import './globals.css'

// next/font downloads these at build time and serves them from this origin, so
// the page makes no request to Google when someone opens it. The previous
// version loaded Inter with a plain <link>, which meant every visitor's
// browser announced itself to a third party before the first paint.
const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-instrument-sans',
  display: 'swap',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'LUT Generator | Create Professional Color Grading LUTs',
  description: 'Generate custom .cube LUT files from reference images, presets, or manual controls. Compatible with Final Cut Pro, Premiere Pro, DaVinci Resolve, and more.',
  keywords: ['LUT', 'color grading', 'cube file', 'Final Cut Pro', 'Premiere Pro', 'DaVinci Resolve'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen bg-background antialiased">
        {children}
      </body>
    </html>
  )
}
