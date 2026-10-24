FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
COPY scripts/build.mjs ./scripts/build.mjs
RUN npm run build && npm prune --omit=dev

FROM node:24.15.0-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATA_DIR=/app/data
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node LICENSE THIRD_PARTY_NOTICES.md PRIVACY.md AUTHENTICATION.md ./
COPY --chown=node:node third-party ./third-party
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 8787 1455
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "require('node:http').get('http://127.0.0.1:8787/health',{headers:{Host:new URL(process.env.PUBLIC_ORIGIN||'http://127.0.0.1:8787').host}},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node","dist/main.js"]
