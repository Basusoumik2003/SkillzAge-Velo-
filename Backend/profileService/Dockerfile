FROM node:20-alpine

WORKDIR /app

COPY profileService/package*.json ./
RUN npm ci --omit=dev

COPY profileService/src ./src

ENV NODE_ENV=production
EXPOSE 5002

CMD ["node", "src/server.js"]
