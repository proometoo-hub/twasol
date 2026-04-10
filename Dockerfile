FROM node:20-bullseye-slim
WORKDIR /app

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/
RUN npm install

COPY . .
RUN npm run build -w client

ENV NODE_ENV=production
ENV PORT=4000
ENV BIND_HOST=0.0.0.0
ENV STORAGE_ROOT=/app/storage

RUN mkdir -p /app/storage/data /app/storage/private_media /app/storage/uploads

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["npm", "run", "start"]
