FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends imagemagick poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY apps-script ./apps-script
COPY src ./src
COPY README.md ./

EXPOSE 3000

CMD ["npm", "start"]
