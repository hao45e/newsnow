# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

NewsNow is a trending-news aggregator: a React 19 SPA served by a Nitro backend that scrapes ~50 news sources, caches results, and supports GitHub-OAuth login with cross-device sync. Requires Node.js >= 20 and pnpm (via `corepack enable`).

## Commands

```sh
pnpm dev          # presource + vite dev server (frontend + Nitro API together)
pnpm build        # presource + production build → dist/output/{public,server}
pnpm start        # run the built Node server (needs .env.server)
pnpm lint         # eslint (uses @ourongxing/eslint-config); `pnpm lint --fix` to autofix
pnpm typecheck    # tsc for both the node and app TS projects
pnpm test         # vitest (vitest.config.ts)
pnpm presource    # regenerate favicons + shared/sources.json + shared/pinyin.json
```

Single test: `pnpm test common` (filter by filename) or `pnpm test -t "name"` (filter by test name). Tests are `server/**/*.test.ts`, `shared/**/*.test.ts`, `test/**/*.test.ts`; vitest runs with `globals: true` (no need to import `describe`/`it`/`expect`).

Local dev needs `.env.server` (copy from `example.env.server`). Without `JWT_SECRET`/`G_CLIENT_ID`/`G_CLIENT_SECRET`, login is disabled but scraping still works.

## Two non-obvious things that bite

**1. Auto-imports (unimport).** Most utilities are globally auto-imported — that's why source files call `defineSource`, `myFetch`, `logger`, `sources`, `metadata`, `atom`, `useAtomValue`, etc. with no import statement. Do NOT add manual imports for these; match the surrounding files. Auto-import scopes differ by side:
- Frontend (`vite.config.ts`): `src/{hooks,utils,atoms}` + selected `shared/*` + React + Jotai (`atom`, `useAtom*`) + `clsx` as `$`.
- Server/Nitro (`nitro.config.ts`): `server/utils` + `shared`, plus H3 handler helpers (`defineEventHandler`, `getQuery`, `createError`, `useDatabase`, …).

Generated declaration files (`imports.app.d.ts`, `src/routeTree.gen.ts`) and `shared/sources.json`/`pinyin.json` are build artifacts — don't hand-edit them.

**2. `presource` must rerun after touching sources.** `shared/pre-sources.ts` is the hand-written registry; `pnpm presource` runs `genSources()` to emit `shared/sources.json` (consumed everywhere via `shared/sources.ts`) and `shared/pinyin.json` (search). The `SourceID`/`AllSourceID` union types are derived from `pre-sources.ts` at compile time, but the runtime API and metadata read `sources.json`. Edit a source registry entry or add a source file without rerunning presource and the new source is invisible at runtime / types drift. `pnpm dev` and `pnpm build` run it automatically.

## Path aliases

`~` → `src` (frontend), `@shared` → `shared`, `#` → `server`. Defined in `vite.config.ts`, `nitro.config.ts`, `vitest.config.ts`, and the tsconfigs. Two TS projects: `tsconfig.app.json` (src + shared) and `tsconfig.node.json` (server, scripts, tools, shared); `pnpm typecheck` runs both.

## Architecture: how a source flows end to end

A "source" has two halves that share an ID:

1. **Registry** — `shared/pre-sources.ts`: declares each source's `name`, `color`, `column`, `type` (`hottest`/`realtime`), `interval`, and optional `sub` map for multi-feed sources. `genSources()` flattens `sub` entries into `parent-subid` IDs, applies defaults (`color: "primary"`, `interval: Time.Default`), drops `disable: true` (and `disable: "cf"` on Cloudflare), and makes the parent ID `redirect` to its first sub.
2. **Getter** — `server/sources/<id>.ts`: a `defineSource(async () => NewsItem[])` (or a map of them for sub-sources) that fetches/parses and returns `NewsItem[]`. `server/getters.ts` glob-imports every `server/sources/{*.ts,**/index.ts}` into a `getters` record keyed by ID. Helpers in `server/utils/source.ts`: `defineRSSSource`, `defineRSSHubSource`, `proxySource`. Always fetch via `myFetch` (`server/utils/fetch.ts` — preset UA, timeout, retry).

**Request path** (`server/api/s/index.ts`, `GET /api/s?id=&latest=`): validate id (following `redirect`) → check `Cache` → serve cache if `now - updated < source.interval` (status `success`); else if within `TTL` (30 min) serve cache (status `cache`) unless a logged-in user forces `latest`; else call the getter, store top 30 items, return fresh. `POST /api/s/entire` batch-reads many sources from cache only (`server/api/s/entire.post.ts`). Cache layer is `server/database/cache.ts` (table created lazily; gated by `ENABLE_CACHE`/`INIT_TABLE`).

**Columns** (`shared/metadata.ts`): fixed columns are `focus`, `hottest`, `realtime`. `hottest`/`realtime` are computed from each source's `type`; other (hidden) columns are computed from `source.column`; `focus` is the user's personal selection.

## Frontend data & state

- **Server state**: TanStack Query. Query keys are `["source", id]` (single, in `src/components/column`) and `["entire", sortedIds]` (batch warm-up, `src/hooks/query.ts`). A module-level `cacheSources` map dedupes and triggers per-source refetch when batch data is newer.
- **Client state**: Jotai. `primitiveMetadataAtom` (`src/atoms/primitiveMetadataAtom.ts`) holds the user's column→source layout, persisted to `localStorage` under `metadata`, write-guarded by `updatedTime` (last-write-wins). `preprocessMetadata` reconciles stored layout with current sources (drops removed sources, follows `redirect`s, appends new defaults). For logged-in users `src/hooks/useSync.ts` syncs this blob with `GET/POST /api/me/sync`.
- **Routing**: TanStack Router, file-based in `src/routes` (`__root.tsx`, `index.tsx`, `c.$column.tsx`); tree generated into `src/routeTree.gen.ts`. Drag-and-drop column/card reordering uses `@atlaskit/pragmatic-drag-and-drop`.

## Auth

GitHub OAuth: `server/api/oauth/github.ts` issues a JWT; `server/middleware/auth.ts` verifies `Authorization: Bearer` on `/api/s` and `/api/me`, populating `event.context.user`. Missing OAuth/JWT env → `event.context.disabledLogin = true` and `/api/me*` is blocked while public scrape endpoints stay open. User data table: `server/database/user.ts`.

## Deployment presets

`nitro.config.ts` switches Nitro preset + database connector by env var: default `node-server` + `better-sqlite3`; `CF_PAGES` → `cloudflare-pages` + Cloudflare D1 (binding `NEWSNOW_DB`, configured in `wrangler.toml`); `VERCEL` → `vercel-edge` (bring your own db0 connector); `BUN` → `bun` + `bun-sqlite`. Database is abstracted via `db0` (`useDatabase()`), so connector swaps without touching query code. `pnpm preview`/`pnpm deploy` build with `CF_PAGES=1`. Docker via `docker compose up`.

## Adding a source

See `CONTRIBUTING.md` for the full walkthrough. Short version: add the entry to `shared/pre-sources.ts`, implement the getter in `server/sources/`, run `pnpm presource`, then `pnpm dev` to verify. Each item must conform to `NewsItem` (`shared/types.ts`): `id`, `title`, `url`, optional `pubDate`/`mobileUrl`/`extra`.
