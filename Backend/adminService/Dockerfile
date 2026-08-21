FROM node:20-alpine

WORKDIR /app

COPY shared ./shared

COPY adminService/package*.json ./adminService/

RUN printf '{"name":"skillzage-backend-node-services","version":"1.0.0","private":true}' > package.json \
    && cd adminService \
    && npm ci --omit=dev --ignore-scripts

COPY adminService/src ./adminService/src

WORKDIR /app/adminService

ENV NODE_ENV=production

EXPOSE 8004

CMD ["npm", "start"]