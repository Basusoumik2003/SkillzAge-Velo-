FROM node:20-alpine

WORKDIR /app

COPY shared ./shared

COPY profileService/package*.json ./profileService/

RUN printf '{"name":"skillzage-backend-node-services","version":"1.0.0","private":true}' > package.json \
    && cd profileService \
    && npm ci --omit=dev

COPY profileService/src ./profileService/src

WORKDIR /app/profileService

ENV NODE_ENV=production

EXPOSE 5002

CMD ["node", "src/server.js"]