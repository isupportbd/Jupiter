ARG BUN_VERSION=latest
FROM oven/bun:${BUN_VERSION} AS builder

WORKDIR /app

ARG UI=true
ENV UI=${UI}

COPY package.json bun.lock* ./
RUN bun install

COPY . .

# Build Vue 3 / Vite Frontend
RUN bun run build:ui

# ── Production Stage ─────────────────────────────────────────
FROM oven/bun:${BUN_VERSION} AS runner

WORKDIR /app

# Install curl, wget & ca-certificates for Coolify healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends curl wget ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV APP_PORT=80

# Production dependencies
COPY package.json ./
RUN bun install --production

# Backend source
COPY src ./src

# Frontend build output
COPY --from=builder /app/public ./public

# Config files & Startup Entrypoint
COPY drizzle.config.ts ./
COPY tsconfig.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 80 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -f http://127.0.0.1:${APP_PORT:-80}/health || wget -qO- http://127.0.0.1:${APP_PORT:-80}/health || bun --eval "fetch(\`http://127.0.0.1:\${process.env.APP_PORT || 80}/health\`).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["/bin/sh", "/app/docker-entrypoint.sh"]
