# Dockerfile for Kerala SEC Voter API with Playwright

FROM node:20-bullseye

# Install Playwright dependencies AND Noto Sans fonts for Malayalam support
RUN apt-get update && apt-get install -y \
    # Playwright/Chromium dependencies
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
    # Noto Sans fonts for Malayalam/Indic languages
    fonts-noto-core \
    fonts-noto-ui-core \
    fonts-noto-cjk \
    fonts-liberation \
    fontconfig \
    && fc-cache -fv \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (postinstall will install Playwright)
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directories for PDFs and uploads
RUN mkdir -p generated-pdfs uploads

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "server.js"]
