FROM node:20-alpine

WORKDIR /app

COPY shared ./shared
COPY gatewayService/package*.json ./gatewayService/

# The service declares the parent directory as a local package dependency.
RUN printf '{"name":"internlabs-backend-node-services","version":"1.0.0","private":true}' > package.json \
    && cd gatewayService \
    && npm ci --omit=dev --ignore-scripts

COPY gatewayService/src ./gatewayService/src

WORKDIR /app/gatewayService
ENV NODE_ENV=production
EXPOSE 8001

CMD ["npm", "start"]
