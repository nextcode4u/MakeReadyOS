FROM node:24-alpine

WORKDIR /app

# Server-side PDF exports need emoji glyphs independently of the viewer's fonts.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto-emoji poppler-utils

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

EXPOSE 4000

CMD ["sh", "-c", "(npm run db:deploy || npm run db:push) && npm run seed && npm run start"]
