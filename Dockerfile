# ─── Stage 1: Build React frontend ───────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ─── Stage 2: Production image ────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Copy backend source
COPY backend/ ./backend/

# Copy built frontend
COPY --from=frontend-builder /build/frontend/dist ./frontend/dist

# Data directory for SQLite db (mounted as volume)
RUN mkdir -p /data

# Non-root user for security
RUN addgroup -S cyride && adduser -S cyride -G cyride
RUN chown -R cyride:cyride /app /data
USER cyride

ENV DATA_DIR=/data
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "backend/server.js"]
