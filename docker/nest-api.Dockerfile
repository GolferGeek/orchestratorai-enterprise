# syntax=docker/dockerfile:1
# Generic NestJS API image — build from monorepo root with Turbo.
#
# Required build args:
#   TURBO_FILTER  e.g. @orchestratorai/platform-api
#   APP_DIR       e.g. apps/api (path to package containing dist/main.js)

ARG TURBO_FILTER
ARG APP_DIR

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NO_UPDATE_NOTIFIER=1 \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_LOGLEVEL=error \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    TURBO_TELEMETRY_DISABLED=1
COPY package.json package-lock.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --no-audit --fund=false --loglevel=error
ARG TURBO_FILTER
RUN npx turbo run build --filter="${TURBO_FILTER}"
RUN npm prune --omit=dev --no-audit --fund=false --loglevel=error

FROM node:22-bookworm-slim AS runner
ARG APP_DIR
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/${APP_DIR}
CMD ["node", "dist/main.js"]
