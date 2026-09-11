import {
  createNode,
  NODE_DEFAULTS,
  newId,
  SceneStore,
  type AppearAnimation,
  type NodeId,
  type NodePatch,
  type NodeType,
  type Shadow,
  type TextNode,
} from '@codeframe/scene'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import { measureText } from './text'

/** Bumped when the seed changes; older drafts stay in IndexedDB under their own key. */
const LOCAL_DOC = 'codeframe:draft:v2'

export interface OpenDocument {
  store: SceneStore
  persistence: IndexeddbPersistence
}

/** Single-player for now: the Yjs doc persists to IndexedDB. Step 3 adds the sync provider. */
export async function openLocalDocument(): Promise<OpenDocument> {
  const doc = new Y.Doc()
  const persistence = new IndexeddbPersistence(LOCAL_DOC, doc)
  await persistence.whenSynced
  const store = new SceneStore(doc)
  if (store.nodes.size === 0) seedDocument(store)
  return { store, persistence }
}

/** A two-frame landing prototype that exercises states, appear/loop motion and links. */
function seedDocument(store: SceneStore) {
  const untracked = { untracked: true }
  store.transact(() => store.meta.set('title', 'Northwind landing'), untracked)

  const add = (type: NodeType, parentId: NodeId | null, name: string, props: NodePatch, id?: NodeId) =>
    createNode(store, { type, parentId, id, props: { name, ...props } }, untracked)

  const text = (parentId: NodeId, name: string, props: Partial<TextNode>, extra: NodePatch = {}) => {
    const node = { ...NODE_DEFAULTS.text, ...props }
    return add('text', parentId, name, { ...props, ...measureText(node), ...extra })
  }

  const appear = (preset: AppearAnimation['preset'], delay: number, duration = 700): NodePatch => ({
    appear: { preset, delay, duration, easing: 'ease-out', distance: 28 },
  })
  const lift: Shadow = { x: 0, y: 12, blur: 28, color: '#D4441C40' }
  const quick = { duration: 160, delay: 0, easing: 'ease-out' } as const
  const cardId = newId()

  const landing = add('frame', null, 'Landing', {
    x: 0,
    y: 0,
    width: 1280,
    height: 800,
    fill: '#FFFFFF',
    shadow: { x: 0, y: 24, blur: 60, color: '#1A181414' },
  })
  text(landing, 'Logo', { x: 48, y: 26, text: 'Northwind', fontFamily: 'Fraunces', fontWeight: 600, fontSize: 24 })
  for (const [label, x] of [['Product', 820], ['Pricing', 916], ['Journal', 1006]] as const) {
    text(landing, `Nav / ${label}`, { x, y: 32, text: label, fontSize: 15, fill: '#4A453C' }, { hover: { fill: '#D4441C' }, transition: quick })
  }
  const signIn = add('frame', landing, 'Sign in', {
    x: 1112,
    y: 20,
    width: 120,
    height: 40,
    fill: '#1A1814',
    cornerRadius: 6,
    hover: { fill: '#4A453C' },
    press: { scale: 0.96 },
    transition: quick,
  })
  text(signIn, 'Label', { x: 34, y: 9, text: 'Sign in', fontSize: 15, fontWeight: 500, fill: '#FFFFFF' })
  text(
    landing,
    'Headline',
    {
      x: 48,
      y: 176,
      text: 'Tools for teams\nwho ship on paper.',
      fontFamily: 'Fraunces',
      fontWeight: 500,
      fontSize: 68,
      lineHeight: 1.05,
      letterSpacing: -1,
    },
    appear('slide-up', 0),
  )
  text(
    landing,
    'Lede',
    {
      x: 48,
      y: 356,
      width: 520,
      autoResize: 'height',
      text: 'Plan, draft and hand off in one place. Every frame you set here compiles to components your engineers would have written themselves.',
      fontSize: 19,
      lineHeight: 1.5,
      fill: '#4A453C',
    },
    appear('slide-up', 120),
  )
  const cta = add('frame', landing, 'Start button', {
    x: 48,
    y: 486,
    width: 188,
    height: 52,
    fill: '#D4441C',
    cornerRadius: 8,
    ...appear('slide-up', 240),
    hover: { scale: 1.04, y: -2, shadow: lift },
    press: { scale: 0.97, y: 0 },
    transition: { duration: 180, delay: 0, easing: 'spring' },
    link: { target: cardId, transition: 'push-left', duration: 520, easing: 'ease-in-out' },
  })
  text(cta, 'Label', { x: 32, y: 14, text: 'Start a draft', fontSize: 17, fontWeight: 600, fill: '#FFFFFF' })
  add('rect', landing, 'Hero image', {
    x: 700,
    y: 132,
    width: 532,
    height: 560,
    fill: '#E9E4DA',
    cornerRadius: 16,
    ...appear('scale', 150, 900),
  })
  add('ellipse', landing, 'Accent', {
    x: 1080,
    y: 600,
    width: 260,
    height: 260,
    fill: '#F2B64C',
    ...appear('fade', 400, 800),
    loop: { preset: 'float', duration: 4000, easing: 'ease-in-out' },
  })

  const card = add(
    'frame',
    null,
    'Article card',
    { x: 1360, y: 0, width: 360, height: 440, fill: '#FFFFFF', cornerRadius: 16, shadow: { x: 0, y: 18, blur: 40, color: '#1A18141F' } },
    cardId,
  )
  add('rect', card, 'Cover', { x: 16, y: 16, width: 328, height: 200, fill: '#DCE6D8', cornerRadius: 10, ...appear('fade', 0, 600) })
  text(card, 'Title', { x: 24, y: 236, text: 'Field notes', fontFamily: 'Fraunces', fontWeight: 600, fontSize: 26 }, appear('slide-up', 100))
  text(
    card,
    'Summary',
    {
      x: 24,
      y: 280,
      width: 312,
      autoResize: 'height',
      text: 'A weekly column on shipping interfaces that survive contact with production.',
      fontSize: 15,
      lineHeight: 1.5,
      fill: '#4A453C',
    },
    appear('slide-up', 180),
  )
  add('ellipse', card, 'Avatar', { x: 24, y: 384, width: 32, height: 32, fill: '#7A3B69' })
  text(card, 'Byline', { x: 68, y: 390, text: 'Ada Park · 4 min read', fontSize: 14, fill: '#4A453C' })
  text(
    card,
    'Back link',
    { x: 278, y: 390, text: '← Back', fontSize: 14, fontWeight: 500, fill: '#D4441C' },
    { hover: { opacity: 0.6 }, transition: quick, link: { target: 'back', transition: 'push-right', duration: 520, easing: 'ease-in-out' } },
  )
}
