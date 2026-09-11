import type { AssetRecord } from '@codeframe/scene'
import { useEffect, useState } from 'react'

const MAX_EDGE = 2048
const cache = new Map<string, HTMLImageElement>()

function cachedImage(src: string): HTMLImageElement {
  let img = cache.get(src)
  if (!img) {
    img = new Image()
    img.decoding = 'async'
    img.src = src
    cache.set(src, img)
  }
  return img
}

export function useAssetImage(src: string | undefined): HTMLImageElement | null {
  const [, setLoaded] = useState(0)
  const img = src ? cachedImage(src) : null
  useEffect(() => {
    if (!img || img.complete) return
    const onLoad = () => setLoaded((n) => n + 1)
    img.addEventListener('load', onLoad)
    return () => img.removeEventListener('load', onLoad)
  }, [img])
  return img && img.complete && img.naturalWidth > 0 ? img : null
}

/**
 * Downscales to at most 2048px and re-encodes as WebP (keeps transparency).
 * The asset id is a content hash, so the same image dropped twice is stored once.
 */
export async function importImageFile(file: File): Promise<AssetRecord> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const src = canvas.toDataURL('image/webp', 0.9)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(src))
  const id = [...new Uint8Array(digest).slice(0, 10)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return { id, mime: 'image/webp', src, width, height }
}
