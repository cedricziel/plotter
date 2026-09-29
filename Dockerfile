# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-alpine AS src
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .

FROM src AS build
ARG BUILD_ID
ENV BUILD_ID=${BUILD_ID}
RUN npm test && npm run build

FROM src AS server-build
RUN npm test && npm run build:server

# API server and waterway data job (same image, different entrypoint).
# Debian rather than Alpine: osmium-tool is not packaged for Alpine.
FROM node:22-bookworm-slim AS server
ARG BUILD_ID=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/cedricziel/plotter" \
      org.opencontainers.image.title="plotter-server" \
      org.opencontainers.image.description="Search, routing and offline-corridor API for Plotter, plus the OpenStreetMap waterway data job" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.version="${BUILD_ID}"
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl osmium-tool \
 && rm -rf /var/lib/apt/lists/* \
 && useradd -M -u 568 -s /usr/sbin/nologin apps \
 && mkdir -p /srv/data /srv/tiles
WORKDIR /app
COPY --from=server-build /app/server-dist /app
COPY deploy/waterways.sh /usr/local/bin/plotter-waterways
RUN chmod 755 /usr/local/bin/plotter-waterways
ENV NODE_ENV=production DATA_DIR=/srv/data TILES_DIR=/srv/tiles PORT=8080
EXPOSE 8080
# Runs as uid 568 ("apps" on TrueNAS) like the web workers; the waterways job
# is started as root by compose so it can write and chown the data dataset.
USER 568
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "/app/server.mjs"]

FROM nginx:1.29-alpine AS web
ARG BUILD_ID=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.source="https://github.com/cedricziel/plotter" \
      org.opencontainers.image.title="plotter" \
      org.opencontainers.image.description="Virtual chartplotter PWA for inland navigation in the Netherlands, served by nginx" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.version="${BUILD_ID}"

# Workers run as uid 568 ("apps" on TrueNAS): the dataset ACL only grants that
# uid access to the mounted chart files.
RUN apk add --no-cache curl jq \
 && adduser -D -H -u 568 -s /sbin/nologin apps \
 && sed -i 's/^user .*;/user apps;/' /etc/nginx/nginx.conf \
 && mkdir -p /srv/tiles

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/tiles.sh /usr/local/bin/plotter-tiles
COPY --from=build /app/dist /usr/share/nginx/html
RUN chmod 755 /usr/local/bin/plotter-tiles

# Real requests through the workers: app shell and a bundled font. Tiles are
# mounted from outside the image and may be absent, so they are not checked.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ \
   && wget -q -O /dev/null 'http://127.0.0.1/fonts/Noto%20Sans%20Regular/0-255.pbf' || exit 1
