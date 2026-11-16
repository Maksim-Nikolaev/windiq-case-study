FROM node:26.13.1-alpine AS runtime
RUN addgroup -S -g 10001 app && adduser -S -D -H -u 10001 -G app app

FROM node:26.13.1-alpine AS base
RUN npm install --global pnpm@12.21.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/fake-upstream/package.json apps/fake-upstream/
COPY apps/web/package.json apps/web/

FROM base AS api-deps
RUN pnpm install --frozen-lockfile --prod --filter @windiq/api

FROM runtime AS api
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_VERSION=$APP_VERSION
WORKDIR /app
COPY --from=api-deps /app/node_modules node_modules
COPY --from=api-deps /app/apps/api/node_modules apps/api/node_modules
COPY apps/api/package.json apps/api/
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/src apps/api/src
WORKDIR /app/apps/api
USER app
EXPOSE 8080 9464
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:8080/api/readyz || exit 1
CMD ["node", "src/main.ts"]

FROM base AS fake-upstream-deps
RUN pnpm install --frozen-lockfile --prod --filter @windiq/fake-upstream

FROM runtime AS fake-upstream
ENV NODE_ENV=production HOST=0.0.0.0
WORKDIR /app
COPY --from=fake-upstream-deps /app/node_modules node_modules
COPY --from=fake-upstream-deps /app/apps/fake-upstream/node_modules apps/fake-upstream/node_modules
COPY apps/fake-upstream/package.json apps/fake-upstream/
COPY apps/fake-upstream/src apps/fake-upstream/src
WORKDIR /app/apps/fake-upstream
USER app
EXPOSE 4010
CMD ["node", "src/server.ts"]

FROM base AS web-build
ARG API_INTERNAL_URL=http://api:8080
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm install --frozen-lockfile --filter @windiq/web
COPY apps/web apps/web
RUN pnpm --filter @windiq/web build

FROM runtime AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static apps/web/.next/static
COPY --from=web-build /app/apps/web/public apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1:3000/icon.svg || exit 1
CMD ["node", "apps/web/server.js"]
