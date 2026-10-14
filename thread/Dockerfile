# Built from the repository root (see .github/workflows/publish.yml):
#   docker build -f thread/Dockerfile --build-arg BUILD_FROM=... .
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest

# The bundle is plain JavaScript, so it's built once on the build machine's
# own architecture rather than under emulation.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
RUN npm ci --ignore-scripts
COPY packages/core packages/core
COPY packages/server packages/server
RUN npm run build -w @thread/server

FROM ${BUILD_FROM}
ARG BUILD_VERSION
ARG BUILD_ARCH
RUN apk add --no-cache nodejs
COPY --from=build /src/packages/server/dist/server.mjs /app/server.mjs
CMD [ "node", "/app/server.mjs" ]

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}" \
  org.opencontainers.image.source="https://github.com/iantrich/hass-notion-crm"
