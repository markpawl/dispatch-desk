# Single Fly.io app, single process: builds the React client and the Node
# Sync Server/MCP Host, then runs the server, which serves the built client
# as static files and handles the /sync WebSocket on the same origin.
#
# First-pass scaffold: copies the whole build stage into the runtime image
# rather than pruning to production-only deps -- simplest thing that works;
# revisit for image size once this is deployed and stable.

FROM node:22-slim AS build
WORKDIR /app

COPY package.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm install

COPY client client
COPY server server
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV CLIENT_DIST_DIR=/app/client/dist

COPY --from=build /app /app

EXPOSE 8080
CMD ["node", "server/dist/index.js"]
