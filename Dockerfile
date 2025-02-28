FROM node:18-alpine

WORKDIR /app

# Install dependencies including dev dependencies for build
COPY package.json package-lock.json ./
RUN npm install

# Install necessary dependencies for Playwright/Chromium with Xvfb for non-headless display
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    font-noto-emoji \
    xvfb \
    dbus

# Set environment variables for Playwright to use system Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV DISPLAY=:99

# Copy source files
COPY . .

# Build TypeScript files
RUN npm run build

# Remove dev dependencies to keep image smaller
RUN npm prune --omit=dev

EXPOSE 3000

# Start Xvfb and then run the application
CMD Xvfb :99 -screen 0 1024x768x16 & sleep 5 && npm start