import { generateNKeysBetween } from 'fractional-indexing'

/**
 * `n` ascending keys that sort into slot `position` of `siblingKeys` (ascending).
 * Concurrent inserts can leave two siblings with the same key, so equal keys
 * after the lower bound are skipped instead of producing an invalid range.
 */
export function keysForPosition(siblingKeys: readonly string[], position: number, n = 1): string[] {
  if (n <= 0) return []
  const pos = Math.max(0, Math.min(position, siblingKeys.length))
  const lo = pos > 0 ? siblingKeys[pos - 1] : null
  let hi: string | null = null
  for (let j = pos; j < siblingKeys.length; j++) {
    if (lo === null || siblingKeys[j] > lo) {
      hi = siblingKeys[j]
      break
    }
  }
  return generateNKeysBetween(lo, hi, n)
}
