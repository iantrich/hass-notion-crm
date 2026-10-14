ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs

WORKDIR /app
COPY spike/ /app/

CMD [ "node", "/app/server.mjs" ]
