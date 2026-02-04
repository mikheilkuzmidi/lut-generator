import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-background antialiased">
        {children}
      </body>
    </html>
  )
}
