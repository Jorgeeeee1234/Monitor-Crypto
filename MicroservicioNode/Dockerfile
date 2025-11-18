FROM node:18

# Establecer directorio de trabajo
WORKDIR /app

# Copiar package.json e instalar dependencias
COPY package*.json ./
RUN npm install --production

# Copiar el resto del código
COPY . .

# Exponer el puerto configurado (puede ser sobrescrito por variable de entorno)
EXPOSE 4001

# Comando para ejecutar el servicio
CMD ["npm", "start"]