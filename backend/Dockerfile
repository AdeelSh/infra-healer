FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN apk add --no-cache curl python3
EXPOSE 3001
CMD ["node", "server.js"]
