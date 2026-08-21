FROM node:20-alpine

WORKDIR /app

COPY shared ./shared

COPY searchService/package*.json ./searchService/

RUN printf '{"name":"skillzage-backend-node-services","version":"1.0.0","private":true}' > package.json \
    && cd searchService \
    && npm ci --omit=dev

COPY searchService/src ./searchService/src

WORKDIR /app/searchService

ENV NODE_ENV=production

EXPOSE 8008

CMD ["node", "src/server.js"]