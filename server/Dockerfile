FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci
COPY shared/ shared/
COPY server/ server/
WORKDIR /app/server
RUN npx prisma generate
RUN npm run build
EXPOSE 4000
CMD ["node", "dist/index.js"]
