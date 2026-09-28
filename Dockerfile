# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG BUILD_ID
ENV BUILD_ID=${BUILD_ID}
RUN npm test && npm run build

FROM nginx:1.29-alpine
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
