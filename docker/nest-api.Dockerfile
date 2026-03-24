# syntax=docker/dockerfile:1
# Generic NestJS API image — build from monorepo root with Turbo.
#
# Required build args:
#   TURBO_FILTER  e.g. @orchestratorai/auth-api
#   APP_DIR       e.g. apps/auth/api (path to package containing dist/main.js)

ARG TURBO_FILTER
ARG APP_DIR

FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci
ARG TURBO_FILTER
RUN npx turbo run build --filter="${TURBO_FILTER}"
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runner
ARG APP_DIR
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/${APP_DIR}
CMD ["node", "dist/main.js"]
