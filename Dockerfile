FROM oven/bun:1.4.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
# Explicit copies keep local databases, secrets and preview dist out of the image.
COPY kit ./kit
COPY machines ./machines
COPY platform ./platform
COPY scripts ./scripts
RUN bun scripts/build.mjs

FROM oven/bun:1.4.4 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/inside-ai.db
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 3000
CMD ["bun", "run", "start"]
