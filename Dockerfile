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

# A build-time version marker (Unix seconds) rather than a git-derived value
# -- no need to smuggle .git into the build context or thread a build-arg
# through `fly deploy`, and it's still a fresh, non-hand-maintained number
# on every image. VITE_-prefixed env vars are picked up by Vite's build
# automatically; the server reads the same file directly (see version.ts).
RUN date +%s > BUILD_TIMESTAMP
RUN VITE_BUILD_TIMESTAMP=$(cat BUILD_TIMESTAMP) npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV CLIENT_DIST_DIR=/app/client/dist

COPY --from=build /app /app

EXPOSE 8080
CMD ["node", "server/dist/index.js"]
