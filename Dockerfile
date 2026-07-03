# --- build: kompilacja TypeScript -> dist/ ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime: tylko produkcyjne zależności + dist ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Koyeb wstrzykuje PORT (domyślnie 8000). Zmienne z kluczami ustawiasz w panelu.
EXPOSE 8000
CMD ["node", "dist/index.js"]
