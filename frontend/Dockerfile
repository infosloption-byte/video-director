FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm install --no-audit --no-fund

# Build-time env (VITE_* vars get baked into the JS bundle here)
ARG VITE_AUTH_REQUIRED=false
ARG VITE_LEGAL_ENTITY_NAME=Voxora
ARG VITE_LEGAL_CONTACT_EMAIL=
ARG VITE_LEGAL_BUSINESS_ADDRESS=
ENV VITE_AUTH_REQUIRED=$VITE_AUTH_REQUIRED \
    VITE_LEGAL_ENTITY_NAME=$VITE_LEGAL_ENTITY_NAME \
    VITE_LEGAL_CONTACT_EMAIL=$VITE_LEGAL_CONTACT_EMAIL \
    VITE_LEGAL_BUSINESS_ADDRESS=$VITE_LEGAL_BUSINESS_ADDRESS

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
