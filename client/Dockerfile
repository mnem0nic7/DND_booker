# Stage 1: Build the React application with Vite
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json client/
COPY shared/package.json shared/
RUN npm ci
COPY tsconfig.json ./
COPY shared/ shared/
COPY client/ client/
WORKDIR /app/client
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
