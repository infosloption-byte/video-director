FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Build-time env (VITE_* vars get baked into the JS bundle here)
ARG VITE_AUTH_REQUIRED=false
ENV VITE_AUTH_REQUIRED=$VITE_AUTH_REQUIRED

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
