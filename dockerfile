# Imagen base con Node 18 y paquetes mínimos
FROM node:18-alpine

# Variables de entorno opcionales (puedes sobreescribirlas en tiempo de ejecución)
ENV PORT=3000

# Directorio de trabajo
WORKDIR /app

# Copia los archivos de NPM antes para aprovechar la cache
COPY package*.json ./

# Instala dependencias de producción
RUN npm install --production

# Copia el resto del código
COPY . .

# Expone el puerto por defecto
EXPOSE 3000

# Comando de arranque
CMD ["npm", "start"]
