FROM node:20-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci
COPY tsconfig.json ./
COPY shared/ shared/
COPY server/ server/
WORKDIR /app/server
RUN npx prisma generate
# Build shared package to dist/ (plain node can't load raw .ts files)
WORKDIR /app/shared
RUN npm run build
RUN sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|' package.json && \
    sed -i 's|"types": "src/index.ts"|"types": "dist/index.d.ts"|' package.json
WORKDIR /app/server
RUN npm run build

# Run as non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodeapp -u 1001 -G nodejs
COPY server/docker-entrypoint.sh /usr/local/bin/server-entrypoint.sh
RUN chmod +x /usr/local/bin/server-entrypoint.sh

EXPOSE 4000
ENTRYPOINT ["/usr/local/bin/server-entrypoint.sh"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
