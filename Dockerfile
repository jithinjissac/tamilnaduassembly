# Dockerfile for Kerala SEC Voter API with Playwright - Optimized for Cloud Run

FROM node:20-bullseye-slim

# Install only essential Playwright dependencies and Malayalam fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core Chromium dependencies (minimal set)
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    # Essential fonts only
    fonts-noto-core \
    fonts-liberation \
    fontconfig \
    && fc-cache -fv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create app directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies with optimizations
# Use --ignore-scripts first to avoid long postinstall during build
RUN npm ci --only=production --no-audit --no-fund --ignore-scripts \
    && npm cache clean --force

# Install Playwright browsers separately (this is cached in Docker layer)
RUN npx playwright install chromium --with-deps

# Copy application code
COPY . .

# Create directories for PDFs and uploads
RUN mkdir -p generated-pdfs uploads public/captcha-cache public/debug-screenshots public/temp-pdfs

# Set environment variables for Cloud Run
ENV PORT=8080 \
    NODE_ENV=production

# Expose port
EXPOSE 8080

# Start application
CMD ["node", "server.js"]
