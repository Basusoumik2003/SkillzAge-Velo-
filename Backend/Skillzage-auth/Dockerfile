FROM node:20-alpine

WORKDIR /app

COPY Skillzage-auth/package*.json ./

RUN npm ci --omit=dev

COPY Skillzage-auth/src ./src

COPY Skillzage-auth/migrations ./migrations

ENV NODE_ENV=production

EXPOSE 5000

CMD ["node", "src/server.js"]