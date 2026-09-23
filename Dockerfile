FROM oven/bun:1.3.14 AS bun

FROM node:22-bookworm-slim AS build

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SIGNUP_DISABLED
ARG BUILD_DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ARG NEXT_BUILD_CPUS=1
ARG NEXT_LOW_MEMORY_BUILD=1

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=2048
ENV DATABASE_URL=${BUILD_DATABASE_URL}
ENV AUTH_SECRET=build-only-auth-secret-not-used-at-runtime
ENV NEXTAUTH_SECRET=build-only-auth-secret-not-used-at-runtime
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_PUBLIC_SIGNUP_DISABLED=${NEXT_PUBLIC_SIGNUP_DISABLED}
ENV NEXT_BUILD_CPUS=${NEXT_BUILD_CPUS}
ENV NEXT_LOW_MEMORY_BUILD=${NEXT_LOW_MEMORY_BUILD}

COPY . .
RUN bun install --frozen-lockfile --linker=hoisted
RUN node node_modules/next/dist/bin/next build

FROM node:22-bookworm-slim

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

COPY --from=build /app /app

EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start"]
