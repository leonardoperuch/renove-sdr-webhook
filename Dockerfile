FROM node:18-alpine

WORKDIR /app

# Instala as dependências primeiro para cache do Docker
COPY package*.json ./
RUN npm install --production

# Copia o restante do código
COPY . .

# Expõe a porta que o app escuta internamente
EXPOSE 3000

# Comando de inicialização
CMD ["npm", "start"]