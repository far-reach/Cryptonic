# Portable image for the Cryptonic autotrader.
# Build:  docker build -t cryptonic-trader packages/trader
# Run:    docker compose up -d   (see docker-compose.yml)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine
RUN addgroup -S trader && adduser -S trader -G trader
COPY --from=build /app/dist /app/dist
COPY config.example.json /app/
# /data holds the config, state file, and optional trader.kill flag —
# mount it as a volume so state survives container replacement.
RUN mkdir /data && chown trader:trader /data
USER trader
WORKDIR /data
ENTRYPOINT ["node", "/app/dist/cli.js"]
# Default to the zero-risk mode; override with: live --config config.json
CMD ["paper"]
