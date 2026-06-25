FROM node:18-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV ADMIN_USER=admin \
    ADMIN_PASS=Admin@123 \
    STREAM_KEY=mystream \
    HTTP_PORT=3000 \
    RTMP_PORT=1935 \
    SESSION_SECRET=change-me-to-a-random-string \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    HLS_DIR=/app/media/hls

EXPOSE 3000 1935

CMD ["node", "server.js"]
