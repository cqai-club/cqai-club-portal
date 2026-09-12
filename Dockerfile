# Multi-stage build for the merged cqai-club-portal (Next.js member center +
# static official site). Produces a self-contained `output: 'standalone'`
# runner plus the `site/` static tree served from disk and prisma (SQLite).
FROM node:24-alpine AS deps

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build:runtime-validator
RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl

# Standalone Next server (+ traced node_modules) and its static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Official-site static HTML/images/collectware (served by route handlers from
# ./site at runtime via readFile(process.cwd())).
COPY --from=builder /app/site ./site

# Prisma: schema, migrations (for `prisma migrate deploy`) and the generated
# client already traced into standalone node_modules.
COPY --from=builder /app/prisma ./prisma
# The standalone trace includes Prisma Client but not the Prisma CLI. Keep the
# CLI and its engines available for the deployment-time migration step.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Runtime feature configuration consumed by the container entrypoint.
COPY --from=builder /app/deploy ./deploy

# Entrypoint + bundled runtime-config validator.
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/scripts/dist/runtime-validator/index.mjs ./scripts/validate-runtime-config.bundle.mjs

RUN chmod +x /app/scripts/docker-entrypoint.sh

# Uploads (submission avatars/company logos) land under ./storage at runtime.
# Keep it writable by the app user used by the standalone server.
RUN mkdir -p /app/storage/uploads/collection

EXPOSE 3000

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
