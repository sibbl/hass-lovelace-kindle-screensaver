FROM node:22-alpine3.20 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

FROM node:22-alpine3.20

WORKDIR /app

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \    
    font-noto-emoji \
    font-noto-cjk \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    imagemagick

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    USE_IMAGE_MAGICK=true

COPY package*.json ./
COPY local.conf /etc/fonts/local.conf

RUN npm ci --omit=dev

COPY --from=builder /app/dist/ ./dist/

EXPOSE 5000

CMD ["node", "dist/index.js"]