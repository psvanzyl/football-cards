# ---- deps & build -------------------------------------------------------
# node:24 is required: the app reads the catalogue through the built-in
# node:sqlite module, which is only available unflagged from Node 23.4 on.
FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json ./
RUN npm install

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runtime ------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# The harvested SQLite catalogue is NOT baked into the image: it is mounted
# read-only at /app/data from the host (Coolify persistent storage). Without the
# mount the site renders its "catalogue not mounted" notice instead of failing.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
