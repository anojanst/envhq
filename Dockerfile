# syntax=docker/dockerfile:1.7
#
# EnvHQ, self-hosted: the web app (UI + API) as one container. Needs a
# Postgres database and an OpenID Connect provider — see
# deploy/docker-compose.yml and /docs/self-hosting.
#
#   docker build -t envhq .
#
# The server never holds a decryption key: values are encrypted in the
# browser and the CLI, and this image stores ciphertext only.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@envhq/web..."
# A placeholder connection string: the build imports the DB module, which
# refuses to load without one, but never connects.
RUN NEXT_OUTPUT=standalone DATABASE_URL=postgres://build:build@localhost:5432/build \
    pnpm --filter @envhq/web build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    ENVHQ_MIGRATE_ON_START=true \
    ENVHQ_MIGRATIONS_DIR=/app/migrations
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /repo/apps/web/src/db/migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
