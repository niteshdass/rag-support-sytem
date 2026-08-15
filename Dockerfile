# SupportPilot backend — Path A deploy (long-running container on Render / Fly / Railway).
# Runs the Express API + in-process Agenda worker from a single Node process (src/index.ts).
# Vector store (Qdrant), keyword search (Meilisearch), DB (Mongo) and LLM (Groq) are
# managed cloud services in this deploy — NOT bundled here. See docs/deployment-path-a.md.

# ---- build stage ----
FROM node:20-slim AS build
WORKDIR /app

# Install deps (full, incl. dev) for the TypeScript build.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune to production deps only.
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Transformers.js caches ONNX models here on first use; keep it writable.
ENV TRANSFORMERS_CACHE=/app/.cache/transformers

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Render/Fly inject PORT; app reads env.PORT (default 3000).
EXPOSE 3000

CMD ["node", "dist/index.js"]
