# ═══════════════════════════════════════════════════════════════════════════════
# IB Gateway Bridge - Multi-stage Docker Build
# ═══════════════════════════════════════════════════════════════════════════════
# Build context should be the project root (orderflow-v2/) so that
# the shared types/ directory is accessible during compilation.
#
#   docker build -f gateway/Dockerfile -t ib-gateway-bridge .
# ═══════════════════════════════════════════════════════════════════════════════

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy gateway package files first for better layer caching
COPY gateway/package.json gateway/package-lock.json* ./gateway/

# Install all dependencies (including devDependencies for tsc)
RUN cd gateway && npm ci

# Copy gateway source and tsconfig
COPY gateway/src ./gateway/src
COPY gateway/tsconfig.json ./gateway/tsconfig.json

# Copy shared types referenced by tsconfig include (../types/ib-protocol.ts)
COPY types/ib-protocol.ts ./types/ib-protocol.ts

# Compile TypeScript
RUN cd gateway && npx tsc

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# Add metadata
LABEL maintainer="orderflow-v2"
LABEL description="IB Gateway Bridge - WebSocket proxy for Interactive Brokers"

# Security: create non-root user
RUN addgroup -S gateway && adduser -S gateway -G gateway

WORKDIR /app

# Copy package files and install production-only dependencies
COPY gateway/package.json gateway/package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/gateway/dist ./dist

# Switch to non-root user
USER gateway

# Expose the WebSocket server port
EXPOSE 4000

# Health check against the /health HTTP endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

# Start the server
CMD ["node", "dist/index.js"]
