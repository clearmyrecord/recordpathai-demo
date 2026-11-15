# Node.js is explicitly packaged in this image. Cloud Run startup must not depend
# on npm being present in an implicitly detected runtime/buildpack image.
FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# Preview images must preserve every stamped PDF field and a visible watermark.
# Poppler supplies deterministic PDF rendering; Liberation supplies canvas text.
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

# Locked dependencies, production packages only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Never copy GitHub OIDC credentials, private .env files or Git metadata:
# see .dockerignore and .gcloudignore.
COPY --chown=node:node . .
USER node

EXPOSE 8080
CMD ["node", "server.js"]
