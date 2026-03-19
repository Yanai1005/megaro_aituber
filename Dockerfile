# Stage 1: Builder
FROM node:24-alpine AS builder

# Install system libraries required by canvas
RUN apk add --no-cache \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    pkgconfig \
    python3 \
    make \
    g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time defaults (can be overridden via --build-arg)
ARG NEXT_PUBLIC_SELECT_AI_SERVICE=google
ARG NEXT_PUBLIC_SELECT_AI_MODEL=gemini-2.5-flash-lite
ARG NEXT_PUBLIC_SELECT_VOICE=voicevox
ARG NEXT_PUBLIC_SELECT_LANGUAGE=ja
ARG NEXT_PUBLIC_ALWAYS_OVERRIDE_WITH_ENV_VARIABLES=true
ARG NEXT_PUBLIC_VOICEVOX_SPEAKER=8

ENV NEXT_PUBLIC_SELECT_AI_SERVICE=$NEXT_PUBLIC_SELECT_AI_SERVICE
ENV NEXT_PUBLIC_SELECT_AI_MODEL=$NEXT_PUBLIC_SELECT_AI_MODEL
ENV NEXT_PUBLIC_SELECT_VOICE=$NEXT_PUBLIC_SELECT_VOICE
ENV NEXT_PUBLIC_SELECT_LANGUAGE=$NEXT_PUBLIC_SELECT_LANGUAGE
ENV NEXT_PUBLIC_ALWAYS_OVERRIDE_WITH_ENV_VARIABLES=$NEXT_PUBLIC_ALWAYS_OVERRIDE_WITH_ENV_VARIABLES
ENV NEXT_PUBLIC_VOICEVOX_SPEAKER=$NEXT_PUBLIC_VOICEVOX_SPEAKER

# Build the Next.js application
RUN npm run build

# Stage 2: Runner
FROM node:24-slim AS runner

# Install runtime system libraries required by canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy built application from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
