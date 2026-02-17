# ───────────────────────────────────────────────────────
# Dockerfile — OpenViber (web + gateway in one container)
# ───────────────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
WORKDIR /app

# ── Install all dependencies ──────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile

# ── Build everything ──────────────────────────────────
FROM deps AS build
COPY . .
# Build gateway + CLI (tsup)
RUN pnpm build
# Build SvelteKit web app
RUN pnpm build:web

# ── Production image ──────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

# Gateway (CLI dist)
COPY --from=build /app/dist dist

# Web (SvelteKit build)
COPY --from=build /app/web/build web/build
COPY --from=build /app/web/package.json web/

# Shared node_modules + root package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json .

# Entrypoint script
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

ENV NODE_ENV=production
# PORT is the public-facing web port (Railway injects this)
# GATEWAY_PORT is internal, defaults to 6009
ENV GATEWAY_PORT=6009
EXPOSE 3000 6009

CMD ["/app/docker-entrypoint.sh"]
