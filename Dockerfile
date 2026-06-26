FROM node:16-alpine3.17

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
COPY tsconfig*.json ./
COPY local.conf /etc/fonts/local.conf

RUN npm ci

COPY src ./src

RUN npm run build && npm prune --omit=dev

EXPOSE 5000

HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "start"]
