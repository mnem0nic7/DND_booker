FROM node:20-alpine

# Pandoc for ePub generation, Poppler for review, and Chromium for canonical HTML PDF export.
RUN apk add --no-cache pandoc poppler-utils su-exec chromium nss freetype harfbuzz ttf-freefont

WORKDIR /app
COPY package*.json ./
COPY worker/package.json worker/
COPY sdk/package.json sdk/
COPY shared/package.json shared/
COPY text-layout/package.json text-layout/
COPY server/package.json server/
RUN npm ci
COPY tsconfig.json ./
COPY config/ config/
COPY sdk/ sdk/
COPY shared/ shared/
COPY text-layout/ text-layout/
COPY worker/ worker/
# Copy server source (generation-orchestrator imports server services at runtime)
COPY server/ server/
COPY worker/docker-entrypoint.sh /usr/local/bin/worker-entrypoint.sh
WORKDIR /app/server
RUN npx prisma generate
# Build shared package to dist/ (plain node can't load raw .ts files)
WORKDIR /app/shared
RUN npm run build
RUN sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|' package.json && \
    sed -i 's|"types": "src/index.ts"|"types": "dist/index.d.ts"|' package.json
WORKDIR /app/text-layout
RUN npm run build
RUN sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|' package.json && \
    sed -i 's|"types": "src/index.ts"|"types": "dist/index.d.ts"|' package.json && \
    sed -i 's|"types": "./src/index.ts"|"types": "./dist/index.d.ts"|' package.json && \
    sed -i 's|"import": "./src/index.ts"|"import": "./dist/index.js"|' package.json && \
    sed -i 's|"default": "./src/index.ts"|"default": "./dist/index.js"|' package.json && \
    sed -i 's|"types": "./src/node.ts"|"types": "./dist/node.d.ts"|' package.json && \
    sed -i 's|"import": "./src/node.ts"|"import": "./dist/node.js"|' package.json && \
    sed -i 's|"default": "./src/node.ts"|"default": "./dist/node.js"|' package.json
WORKDIR /app/worker

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodeapp -u 1001 -G nodejs
RUN chmod +x /usr/local/bin/worker-entrypoint.sh

# Use tsx for runtime TS execution (generation-orchestrator cross-imports server services)
ENTRYPOINT ["/usr/local/bin/worker-entrypoint.sh"]
CMD ["npx", "tsx", "src/index.ts"]
