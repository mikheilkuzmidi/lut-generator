# LUT Generator

Create professional .cube LUT files from reference images, presets, or manual controls. The app outputs industry-standard 3D LUTs compatible with Final Cut Pro, Premiere Pro, DaVinci Resolve, After Effects, and other editors.

## Features

- Image reference analysis to extract grading parameters
- Preset library for common looks
- Manual controls for contrast, saturation, temperature, tint, shadows, highlights, and RGB lift/gamma/gain
- .cube output with standard 33x33x33 grid
- Optional HEVC-optimized output for Apple devices

## Supported Software

- Final Cut Pro
- Adobe Premiere Pro
- DaVinci Resolve
- After Effects
- Avid Media Composer
- LumaFusion
- Any editor that supports .cube LUT files

## Tech Stack

- Next.js
- Tailwind CSS
- TypeScript

## Getting Started

1. Install dependencies:
   `npm install`
2. Run the development server:
   `npm run dev`
3. Open `http://localhost:3000`

## Build For Production

1. Build:
   `npm run build`
2. Start:
   `npm start`

## How To Use The App

1. Choose a generation mode: Reference, Presets, or Manual.
2. Provide your input (image, preset, or manual values).
3. Click `Generate LUT`.
4. Download the `.cube` file or copy it to clipboard.

## How To Use .cube LUTs

### Final Cut Pro

1. Open Effects Browser
2. Search for "Custom LUT"
3. Drag effect to your clip
4. In Inspector, click LUT dropdown
5. Choose "Choose Custom LUT"
6. Select your `.cube` file

### Premiere Pro

1. Select your clip
2. Open Lumetri Color panel
3. Go to Creative tab
4. Click "Look" dropdown
5. Select "Browse"
6. Choose your `.cube` file
7. Adjust Intensity as needed

### DaVinci Resolve

1. Go to Project Settings
2. Select Color Management
3. Click "Open LUT Folder"
4. Copy `.cube` file there
5. Click "Update Lists"
6. In Color tab, right-click node
7. Choose LUTs → 3D LUT

### After Effects

1. Select your layer
2. Effect → Color Correction
3. Apply "Lumetri Color"
4. In Creative section
5. Click "Look" dropdown
6. Browse to `.cube` file

## .cube File Format

The generated LUTs follow the Adobe Cube LUT specification:

- 33x33x33 3D lookup table (35,937 color points)
- RGB values from 0.0 to 1.0
- Red-major ordering (R varies fastest)

## Contributing

Keep changes small and focused. Please run `npm run build` before opening a PR.

## Code Of Conduct

Be respectful, constructive, and professional. Harassment and discrimination are not tolerated.

## Security

If you discover a security issue, open a GitHub issue and clearly mark it as security-sensitive so it can be triaged quickly.

## License

MIT. See `LICENSE`.
