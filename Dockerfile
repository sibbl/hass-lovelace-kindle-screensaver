FROM node:24-alpine3.22 AS builder

WORKDIR /app

COPY package*.json ./
RUN HUSKY=0 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

FROM node:24-alpine3.22

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

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    USE_IMAGE_MAGICK=true

COPY package*.json ./
COPY local.conf /etc/fonts/local.conf

RUN PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist/ ./dist/

EXPOSE 5000

CMD ["node", "dist/index.js"]