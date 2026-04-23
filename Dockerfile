FROM node:18-alpine

WORKDIR /app

# Instala as dependências primeiro para cache do Docker
COPY package*.json ./
RUN npm install --production

# Instala o cliente Docker no Alpine para conseguirmos fazer 'docker exec'
RUN apk add --no-cache docker-cli

# Copia o restante do código
COPY . .

# Expõe a porta que o app escuta internamente
EXPOSE 3000

# Comando de inicialização
CMD ["npm", "start"]