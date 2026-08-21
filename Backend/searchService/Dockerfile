FROM node:20-alpine

WORKDIR /app

COPY searchService/package*.json ./
RUN npm ci --omit=dev

COPY searchService/src ./src

ENV NODE_ENV=production
EXPOSE 8008

CMD ["node", "src/server.js"]
