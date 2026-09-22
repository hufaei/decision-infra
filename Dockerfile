FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@12.5.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/provider-jev/package.json packages/provider-jev/package.json
RUN pnpm install --frozen-lockfile
COPY apps apps
COPY packages packages
COPY models models
COPY tsconfig.json tsconfig.build.json ./
RUN pnpm build

FROM node:22-bookworm-slim

ENV HOST=0.0.0.0 PORT=8080 NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/apps/gateway/src/main.js"]
