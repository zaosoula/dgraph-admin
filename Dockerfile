# Build Stage 1

FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable

# Copy the manifest, the lockfile, the Yarn settings and the vendored Yarn state.
# `.yarn/` must keep its own directory so `.yarn/cache` is found by Yarn.
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/ ./.yarn/

# Install dependencies (--immutable so the lockfile cannot drift during a build)
RUN yarn install --immutable

# Copy the entire project
COPY . ./

# Build the project
RUN yarn build

# Build Stage 2

FROM node:22-alpine
WORKDIR /app

# Only `.output` folder is needed from the build stage
COPY --from=build /app/.output/ ./ 

# Change the port and host
ENV PORT=80
ENV HOST=0.0.0.0

EXPOSE 80

CMD ["node", "/app/server/index.mjs"]
