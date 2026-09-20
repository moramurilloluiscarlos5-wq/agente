FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app
COPY package.json ./
COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend ci --include=dev --no-audit --no-fund
COPY frontend/ ./frontend/
COPY scripts/ ./scripts/
ARG VITE_API_URL=/api
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN test -n "$VITE_SUPABASE_URL" && test -n "$VITE_SUPABASE_ANON_KEY" && npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node backend/ ./backend/
COPY --from=frontend-build --chown=node:node /app/backend/public ./backend/public
USER node
CMD ["npm", "start"]
