FROM node:20-alpine

# Pandoc for ePub generation (Chromium no longer needed — PDF uses Typst NAPI)
RUN apk add --no-cache pandoc

WORKDIR /app
COPY package*.json ./
COPY worker/package.json worker/
COPY shared/package.json shared/
COPY server/package.json server/
RUN npm ci
COPY tsconfig.json ./
COPY shared/ shared/
COPY worker/ worker/
# Copy prisma schema from server (needed for prisma generate)
COPY server/prisma/ server/prisma/
WORKDIR /app/server
RUN npx prisma generate
# Build shared package to dist/ (plain node can't load raw .ts files)
WORKDIR /app/shared
RUN npm run build
RUN sed -i 's|"main": "src/index.ts"|"main": "dist/index.js"|' package.json && \
    sed -i 's|"types": "src/index.ts"|"types": "dist/index.d.ts"|' package.json
WORKDIR /app/worker
RUN npm run build
CMD ["node", "dist/index.js"]
