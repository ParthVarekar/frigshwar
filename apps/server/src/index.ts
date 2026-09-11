/**
 * Codeframe sync server: Hocuspocus (Yjs over WebSocket) with document state
 * persisted to SQLite. Canvas state lives only in the Yjs documents. Project,
 * user and asset metadata get their own tables when auth lands (step 6).
 *
 * The web client doesn't connect yet; that's step 3 (multiplayer).
 */
import { Server } from '@hocuspocus/server'
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import * as Y from 'yjs'

const PORT = Number(process.env.PORT ?? 1234)
const dataDir = fileURLToPath(new URL('../data/', import.meta.url))
mkdirSync(dataDir, { recursive: true })

const db = new DatabaseSync(`${dataDir}documents.sqlite`)
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    name       TEXT PRIMARY KEY,
    state      BLOB NOT NULL,
    updated_at TEXT NOT NULL
  )
`)
const selectState = db.prepare('SELECT state FROM documents WHERE name = ?')
const upsertState = db.prepare(`
  INSERT INTO documents (name, state, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(name) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
`)

const server = new Server({
  name: 'codeframe-sync',
  port: PORT,
  quiet: true,
  debounce: 1000,
  maxDebounce: 5000,

  async onLoadDocument({ documentName, document }) {
    const row = selectState.get(documentName) as { state: Uint8Array } | undefined
    if (row) Y.applyUpdate(document, row.state)
    return document
  },

  async onStoreDocument({ documentName, document }) {
    upsertState.run(documentName, Y.encodeStateAsUpdate(document), new Date().toISOString())
  },
})

await server.listen()
console.log(`codeframe sync · ws://localhost:${PORT}`)
