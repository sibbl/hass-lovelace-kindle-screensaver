FROM node:20-alpine3.20

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
    # Software GL rendering for headless Chrome
    mesa-dri-gallium \
    # Additional packages for better performance
    dumb-init \
    # Sharp dependencies
    vips-dev \
    # Clean up
    && rm -rf /var/cache/apk/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./
COPY local.conf /etc/fonts/local.conf

RUN npm install --production

COPY *.js ./

RUN mkdir -p /kindle-config
ENV CONFIG_DIR=/kindle-config

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]