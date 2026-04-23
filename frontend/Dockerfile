# ─── Etapa 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias
COPY package.json package-lock.json* ./
RUN npm ci --legacy-peer-deps

# Copiar fuentes y compilar
COPY . .
RUN npm run build

# ─── Etapa 2: Nginx para servir la SPA ───────────────────────────────────────
FROM nginx:1.27-alpine

# Copiar build de Vite
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración de Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
