# Relay Mesh — deploy ONLY the relay-node package (crypto is a workspace dep).
# Each of the 5 hops uses this same image with different env vars / Railway accounts.
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/relay-node/package.json ./packages/relay-node/
# Minimal workspace so pnpm can resolve @relay-mesh/crypto + relay-node only
RUN pnpm install --filter @relay-mesh/relay-node... --frozen-lockfile

FROM base AS build
COPY --from=deps /app /app
COPY tsconfig.base.json ./
COPY packages/crypto ./packages/crypto
COPY packages/relay-node ./packages/relay-node
RUN pnpm --filter @relay-mesh/crypto build \
 && pnpm --filter @relay-mesh/relay-node build

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/crypto/package.json ./packages/crypto/
COPY --from=build /app/packages/crypto/dist ./packages/crypto/dist
COPY --from=build /app/packages/crypto/node_modules ./packages/crypto/node_modules
COPY --from=build /app/packages/relay-node/package.json ./packages/relay-node/
COPY --from=build /app/packages/relay-node/dist ./packages/relay-node/dist
COPY --from=build /app/packages/relay-node/node_modules ./packages/relay-node/node_modules

EXPOSE 3000
WORKDIR /app/packages/relay-node
CMD ["node", "dist/index.js"]
