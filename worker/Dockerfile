FROM node:20-alpine

# Install Chromium for Puppeteer and Pandoc for ePub generation
RUN apk add --no-cache chromium pandoc
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

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
WORKDIR /app/worker
RUN npm run build
CMD ["node", "dist/index.js"]
