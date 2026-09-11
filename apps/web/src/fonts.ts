/**
 * Fonts are registered under their canonical family names (not fontsource's
 * "Fraunces Variable") so the document, the canvas, the UI and, later, the
 * generated code all refer to the same family.
 *
 * Loading is awaited before the canvas mounts: Konva measures text on a 2D
 * canvas, and measuring with a fallback font would store wrong text boxes.
 */
import frauncesItalic from '@fontsource-variable/fraunces/files/fraunces-latin-opsz-italic.woff2?url'
import frauncesNormal from '@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2?url'
import interItalic from '@fontsource-variable/inter/files/inter-latin-opsz-italic.woff2?url'
import interNormal from '@fontsource-variable/inter/files/inter-latin-opsz-normal.woff2?url'
import plexMono400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?url'
import plexMono400Italic from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-italic.woff2?url'
import plexMono500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?url'
import plexSans400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?url'
import plexSans400Italic from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff2?url'
import plexSans500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2?url'
import plexSans600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?url'

type Face = [family: string, url: string, descriptors: FontFaceDescriptors]

const FACES: Face[] = [
  ['Fraunces', frauncesNormal, { weight: '100 900', style: 'normal' }],
  ['Fraunces', frauncesItalic, { weight: '100 900', style: 'italic' }],
  ['IBM Plex Sans', plexSans400, { weight: '400' }],
  ['IBM Plex Sans', plexSans400Italic, { weight: '400', style: 'italic' }],
  ['IBM Plex Sans', plexSans500, { weight: '500' }],
  ['IBM Plex Sans', plexSans600, { weight: '600' }],
  ['IBM Plex Mono', plexMono400, { weight: '400' }],
  ['IBM Plex Mono', plexMono400Italic, { weight: '400', style: 'italic' }],
  ['IBM Plex Mono', plexMono500, { weight: '500' }],
  ['Inter', interNormal, { weight: '100 900', style: 'normal' }],
  ['Inter', interItalic, { weight: '100 900', style: 'italic' }],
]

/** Fonts a design can use, with the weights actually shipped for each. */
export const CONTENT_FONTS: Record<string, readonly number[]> = {
  'IBM Plex Sans': [400, 500, 600],
  Inter: [300, 400, 500, 600, 700, 800],
  Fraunces: [300, 400, 500, 600, 700, 800],
  'IBM Plex Mono': [400, 500],
}

export async function loadFonts(): Promise<void> {
  const faces = FACES.map(([family, url, descriptors]) => {
    const face = new FontFace(family, `url(${url}) format("woff2")`, descriptors)
    document.fonts.add(face)
    return face.load()
  })
  await Promise.allSettled(faces)
}
