# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build: `npm run build`
- Start production server: `npm run start` / `npm run start:win`
- Lint: `npm run lint`
- Type check: `npx tsc --noEmit`
- Validate runtime config: `node scripts/validate-runtime-config.mjs`

### Docker

- Pull image: `docker compose pull`
- Start services: `docker compose up -d`
- Restart after config change: `docker compose restart app`
- View logs: `docker compose logs -f app`

Image selection is controlled by:

- `IMAGE_REPO` (default: `ghcr.io/your-org/account-center`)
- `IMAGE_TAG` (default: `latest`, recommended: `vX.Y.Z` in production)

Image selection is controlled by:

- `IMAGE_REPO` (default: `ghcr.io/your-org/account-center`)
- `IMAGE_TAG` (default: `latest`, recommended: `vX.Y.Z` in production)

## High-Level Architecture

Next.js 16 App Router project with two surfaces:

- `app/dashboard/*`: authenticated account center
- `app/portal/*`: service portal UI

### Authentication Layer (`lib/logto/`)

```
lib/logto/
├── types.ts
├── config.ts
├── client.ts
├── account-api.ts
├── management-api.ts
└── index.ts
```

## Runtime Config Model (critical)

No YAML->TS generation pipeline is used.

- Runtime files: `.env`, `deploy/features.yaml`, `deploy/services.yaml`
- Runtime loader: `lib/config/runtime-config.ts`
- Runtime validator: `scripts/validate-runtime-config.mjs`
- Public client config endpoint: `/api/public-config`

`CONFIG_DIR` defaults to `deploy`.

## Request / Rendering Flow

- `app/dashboard/layout.tsx` gates auth via `getLogtoContext()`
- Client pages use internal API routes (not direct Logto calls)
- Route handlers generally:
  1. verify auth
  2. enforce feature gates from runtime config
  3. delegate to `lib/logto/*`
  4. validate request bodies with Zod schemas in `lib/schemas.ts`

## Docker Runtime Notes

- Entrypoint: `scripts/docker-entrypoint.sh`
- Container reads `/app/deploy/.env`
- Container validates `/app/deploy/features.yaml` + `/app/deploy/services.yaml`
- Compose mounts host `.env` + `deploy/*.yaml` into `/app/deploy`
