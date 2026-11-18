FROM node:20-slim

# better-sqlite3 needs a C++ toolchain to compile
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

# Data folder mounted as a volume — see docker-compose.yml
RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]