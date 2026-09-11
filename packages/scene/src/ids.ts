const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 12 random base-36 chars (~62 bits). Short enough to read in a debugger, wide enough for a shared doc. */
export function newId(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const b of bytes) id += ALPHABET[b % 36]
  return id
}
