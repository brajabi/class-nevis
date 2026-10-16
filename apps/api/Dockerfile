# Build from the repo root:  docker build -f apps/api/Dockerfile .
FROM oven/bun:1.4.3

WORKDIR /app

# Install only the API's dependencies (not the whole Expo workspace).
COPY apps/api/package.json ./
RUN bun install

COPY apps/api/ ./
# prisma.config.ts reads DATABASE_URL; generate doesn't connect, so a placeholder is enough.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" bunx --bun prisma generate

ENV NODE_ENV=production \
    PORT=4000 \
    STORAGE_DIR=/data/storage

# Audio files live here: mount a persistent volume on /data so no recording is ever lost on redeploy.
VOLUME ["/data"]
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD bun -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply pending migrations, then start the server.
CMD ["sh", "-c", "bunx --bun prisma migrate deploy && bun src/index.ts"]
