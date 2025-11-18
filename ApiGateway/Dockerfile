FROM node:18

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los ficheros de definición de dependencias y los instala
COPY package*.json ./
RUN npm install

# Copia el resto del código de la aplicación
COPY . .

# Expone el puerto en el que se ejecutará el API Gateway
EXPOSE 5000

# Comando por defecto
CMD ["npm", "start"]