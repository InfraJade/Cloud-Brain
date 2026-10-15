# CLOUD BRAIN website — built with Vite, served by nginx, which also forwards /api to the backend.

# ── Build ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@10.15.1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# Type-checks, then builds to /app/dist. The site calls the API on its own origin (/api).
RUN pnpm build

# ── Serve ────────────────────────────────────────────────────────────────────
# Unprivileged nginx: runs as a non-root user and listens on 8080 inside the container.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:8080/ || exit 1
