FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY prisma ./prisma
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
    && node node_modules/@prisma/engines/scripts/postinstall.js \
    && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma

COPY index.js ./
COPY public ./public
COPY web ./web

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma && exec node index.js"]
