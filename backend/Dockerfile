FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
RUN npm install
COPY backend backend
RUN npm --workspace backend run prisma:generate && npm --workspace backend run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY backend/package.json backend/package.json
RUN npm install --omit=dev
COPY --from=build /app/backend/prisma /app/backend/prisma
RUN npm --workspace backend run prisma:generate
COPY --from=build /app/backend/dist /app/backend/dist
COPY frontend /app/frontend
RUN mkdir -p /app/storage/imports /app/storage/exports
EXPOSE 3000
CMD ["node", "backend/dist/src/server.js"]
