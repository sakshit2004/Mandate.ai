# Mandate production image — UI + API on one port
# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
COPY server ./server

ENV DATABASE_URL="postgresql://mandate:mandate@127.0.0.1:5432/mandate"
RUN test -n "$VITE_CLERK_PUBLISHABLE_KEY" \
  || (echo "FATAL: VITE_CLERK_PUBLISHABLE_KEY build argument is required" && exit 1)
RUN npx prisma generate \
  && npm run build \
  && npx tsc -p server/tsconfig.json

FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    curl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
  PORT=8788 \
  STANDALONE=1 \
  EMAIL_CONSOLE=0 \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
  PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY scripts/start.mjs ./scripts/start.mjs
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

RUN npx prisma generate

EXPOSE 8788
CMD ["node", "scripts/start.mjs"]
