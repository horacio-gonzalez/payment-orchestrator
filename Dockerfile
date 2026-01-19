# 1) Etapa de build
FROM node:20-alpine AS builder
WORKDIR /usr/src/app

# Copiamos sólo package.json para cachear la instalación de dependencias
COPY package.json package-lock.json ./
RUN npm ci

# Copiamos el resto del código y construimos el bundle de producción
COPY . .
RUN npm run build

# 2) Etapa de producción
FROM node:20-alpine AS runner
WORKDIR /usr/src/app

# Solo copiamos lo estrictamente necesario: package.json para instalar producción y el dist compilado
COPY package.json package-lock.json ./
RUN npm ci --production

COPY --from=builder /usr/src/app/dist ./dist

# Exponemos el puerto en el que se ejecuta Nest (por defecto 3000)
EXPOSE 3000

# Comando por defecto
CMD ["node", "dist/main.js"]
