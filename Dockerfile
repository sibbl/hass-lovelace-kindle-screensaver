FROM node:22-alpine3.22 AS build

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./

RUN npm ci

COPY src ./src

RUN npm run build && npm prune --omit=dev

FROM node:22-alpine3.22

WORKDIR /app

RUN apk add --no-cache \
    ca-certificates \
    chromium \
    font-noto-cjk \
    font-noto-emoji \
    freetype \
    harfbuzz \
    imagemagick \
    nss \
    ttf-freefont

ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    USE_IMAGE_MAGICK=true

COPY local.conf /etc/fonts/local.conf
COPY package.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

EXPOSE 5000

HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 5000) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "start"]
