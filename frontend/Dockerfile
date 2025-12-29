# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Accept build-time arguments for Next.js public environment variables
# These are needed at build time for Next.js to embed them in the bundle
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_PRIVY_CLIENT_ID
ARG NEXT_PUBLIC_COPILOTKIT_API_KEY
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_MOSAIC_API_KEY
ARG NEXT_PUBLIC_MOVEMENT_FULL_NODE
ARG NEXT_PUBLIC_MOVEMENT_CHAIN_ID
ARG NEXT_PUBLIC_RAILWAY
ARG NEXT_PUBLIC_IS_RAILWAY

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Set build-time environment variables (Next.js needs these at build time)
ENV NEXT_PUBLIC_PRIVY_APP_ID=${NEXT_PUBLIC_PRIVY_APP_ID}
ENV NEXT_PUBLIC_PRIVY_CLIENT_ID=${NEXT_PUBLIC_PRIVY_CLIENT_ID}
ENV NEXT_PUBLIC_COPILOTKIT_API_KEY=${NEXT_PUBLIC_COPILOTKIT_API_KEY}
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
ENV NEXT_PUBLIC_MOSAIC_API_KEY=${NEXT_PUBLIC_MOSAIC_API_KEY}
ENV NEXT_PUBLIC_MOVEMENT_FULL_NODE=${NEXT_PUBLIC_MOVEMENT_FULL_NODE}
ENV NEXT_PUBLIC_MOVEMENT_CHAIN_ID=${NEXT_PUBLIC_MOVEMENT_CHAIN_ID}
ENV NEXT_PUBLIC_RAILWAY=${NEXT_PUBLIC_RAILWAY}
ENV NEXT_PUBLIC_IS_RAILWAY=${NEXT_PUBLIC_IS_RAILWAY}

# Build the application
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Railway automatically sets PORT, but default to 3000 if not set
ENV PORT=${PORT:-3000}
ENV HOSTNAME="0.0.0.0"

# Runtime environment variables (Railway automatically injects these at runtime)
# These are for server-side only variables that don't need NEXT_PUBLIC_ prefix
# Railway will automatically make these available to the Node.js process via process.env
# No need to declare them here - Railway injects them directly into the container runtime

CMD ["node", "server.js"]

