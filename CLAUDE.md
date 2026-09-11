# Codeframe: notes for agents

A multiplayer design canvas that exports clean React + Tailwind. See [README.md](README.md).

## Start here

1. Read [docs/PROGRESS.md](docs/PROGRESS.md): current milestone, last session's log, how to run checks.
2. [docs/feature-parity.md](docs/feature-parity.md) is the Figma/Framer gap matrix and backlog.
3. [docs/architecture.md](docs/architecture.md) covers packages, data model and pipelines.
   [docs/motion.md](docs/motion.md) is the interaction/animation spec.
4. [docs/design-language.md](docs/design-language.md) ("Broadsheet") governs all editor UI. Don't drift toward Figma/Framer's look.

## Rules

- Update `docs/PROGRESS.md` (checkbox and log entry) at the end of every milestone.
- The Yjs doc is the store. Mutate through `packages/scene` ops, not ad hoc Y.Map writes.
- New node props that are objects must be registered in `COMPOSITE_PROPS` with a normalizer.
- Preview and codegen share the scene→CSS mapping (`packages/scene/src/css.ts`). Keep them in lockstep.
- Keep green: `npm test --workspaces --if-present`, `npx tsc -b` (apps/web), `npm run lint -w apps/web`.
- Don't hand-edit `*.generated.ts`. After changing `packages/runtime/src/motion.tsx`, run `npm run sync:runtime`.
- The runtime ships inside exported projects, so it must compile under their strict tsconfig (no enums or
  namespaces, type-only imports, no unused locals) and depend only on React.
- Prove export changes end to end: `npx tsx scripts/export-smoke.ts <dir>`, then `npm install && npm run build` in `<dir>`.
