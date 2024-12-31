FROM node:22-alpine AS build

WORKDIR /src
ADD dist /src
RUN /bin/sh -c "tar zxf \"$(npm pack)\""

FROM node:22-alpine
WORKDIR /src
ADD integration-tests/cjs /src
COPY --from=build /src/package /src/node_modules/stream-watch
CMD [ "node", "index.js" ]