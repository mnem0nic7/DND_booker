# Stage 1: Build the React application with Vite
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/
COPY shared/package.json shared/
COPY text-layout/package.json text-layout/
RUN npm ci
COPY tsconfig.json ./
COPY shared/ shared/
COPY text-layout/ text-layout/
COPY client/ client/
WORKDIR /app/client
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/templates/default.conf.template
ENV PORT=8080
ENV API_UPSTREAM=server:4000
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
