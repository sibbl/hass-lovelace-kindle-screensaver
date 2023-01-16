FROM node:16-alpine3.17

WORKDIR /app

RUN apk add --no-cache \
    chromium \
    nss \
    freetype \    
    font-noto-emoji \
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

RUN npm ci

COPY *.js ./

EXPOSE 5000

CMD ["npm", "start"]