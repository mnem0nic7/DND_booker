FROM node:20-alpine
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
RUN npm run build
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
