FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cached unless package.json changes)
COPY package*.json ./
RUN npm install --production --no-audit --no-fund

# Copy application files
COPY server.js ./
COPY agents/ ./agents/
COPY context/ ./context/
COPY ARCHITECTURE.md ./

EXPOSE 3000

CMD ["node", "server.js"]
