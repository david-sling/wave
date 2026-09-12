# A Wave instance in a container. Built in three stages so the image that runs
# carries no compiler, no test runner, and no source.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build renders marketing pages that reference the instance origin. A real
# HOST is supplied at run time; this only has to be a valid absolute origin so
# the build can finish. No secret is set here, and none is needed: the instance
# configuration is read per request, not baked into the bundle.
ENV HOST=http://localhost:3000
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Runs as the image's own unprivileged user rather than root.
USER node

COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/package.json ./package.json
# The share-card routes read these at request time, not only during the build.
COPY --from=build --chown=node:node /app/assets ./assets
COPY --from=deps --chown=node:node /app/node_modules ./node_modules

EXPOSE 3000
# The poll route holds a request for up to 50 seconds. Any proxy in front of
# this must allow at least 60, or agents will see their long-polls cut off.
CMD ["npx", "next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
