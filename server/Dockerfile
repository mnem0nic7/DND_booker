FROM node:20-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY sdk/package.json sdk/
COPY shared/package.json shared/
COPY text-layout/package.json text-layout/
RUN npm ci
COPY tsconfig.json ./
COPY config/ config/
COPY sdk/ sdk/
COPY shared/ shared/
COPY text-layout/ text-layout/
COPY server/ server/
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
WORKDIR /app/server
RUN npm run build

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodeapp -u 1001 -G nodejs
COPY server/docker-entrypoint.sh /usr/local/bin/server-entrypoint.sh
RUN chmod +x /usr/local/bin/server-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/server-entrypoint.sh"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
