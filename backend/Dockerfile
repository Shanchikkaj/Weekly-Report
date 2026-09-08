# Multi-stage Dockerfile for Backend API

# Stage 1: Build & compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache make gcc g++ python3 openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci || npm install
RUN npx prisma generate

COPY . .
RUN npm run build

# Stage 2: Lean Production Runtime
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev || npm install --omit=dev
RUN npx prisma generate

# Copy compiled TypeScript outputs from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
