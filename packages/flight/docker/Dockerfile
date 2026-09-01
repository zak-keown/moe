# @tc/moe-flight — `moe-flight qa serve` with a Chromium for the web adapter.
#
# Build context is the MONOREPO ROOT, not this package. That is the change bun
# forced: `bun install --frozen-lockfile` from packages/flight/ worked because
# gauntlet was a standalone repo with its own lockfile and an unlinked `ui/`
# sibling (hence CI's two installs). Here the lockfile, pnpm-workspace.yaml and
# three workspace members are all above this directory, so the context has to
# be. Build it through docker/compose.yaml, which sets `context: ..`.
#
# Chromium, not google-chrome-stable: it is multi-arch, so this image builds on
# the arm64 Macs in this shop as well as amd64 CI.
FROM debian:bookworm-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    gnupg2 \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libxkbcommon0 \
    libxss1 \
    unzip \
    wget \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends chromium \
    && rm -rf /var/lib/apt/lists/*

# Node 24 is the workspace floor (root package.json `engines.node`).
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable

WORKDIR /workspace

# ---------------------------------------------------------------- dependencies
# Manifests first so a source edit does not re-resolve the whole workspace.
# pnpm needs every member's package.json named in pnpm-workspace.yaml to be
# present before `--frozen-lockfile` will resolve, so the tab binding's manifest
# is copied even though this image never builds the Rust cdylib.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/flight/package.json                    packages/flight/
COPY packages/flight/ui/package.json                 packages/flight/ui/
COPY packages/flight/dashboard/package.json          packages/flight/dashboard/
COPY packages/tab/bindings/typescript/package.json   packages/tab/bindings/typescript/
COPY packages/crew/package.json                      packages/crew/
COPY packages/glass/package.json                     packages/glass/
COPY packages/memory/package.json                    packages/memory/
COPY packages/mint/package.json                      packages/mint/
COPY packages/core/package.json                      packages/core/
COPY packages/backstory/package.json                 packages/backstory/
RUN pnpm install --frozen-lockfile --filter @tc/moe-flight... \
    --filter @tc/moe-flight-ui --filter @tc/moe-flight-dashboard

# ---------------------------------------------------------------------- build
COPY tsconfig.base.json tsconfig.json ./
COPY packages/tab/bindings/typescript packages/tab/bindings/typescript
COPY packages/flight packages/flight

# The SPA first: `moe-flight qa serve` statically serves ui/dist and
# `moe-flight qa render` reads ui/dist-static/static.html, both by file path
# from the package root (src/package-root.ts).
RUN pnpm --filter @tc/moe-flight-dashboard build \
    && pnpm --filter @tc/moe-flight-ui build \
    && pnpm --filter @tc/moe-flight build

# No CHROME env var to set: the vendored launcher already probes
# /usr/bin/chromium and /usr/bin/chromium-browser
# (src/qa/adapters/web/lib/chrome-process.js).
WORKDIR /workspace/packages/flight

# Was `ENTRYPOINT ["bun", "run", "src/index.ts"]`. The bin is one level up now:
# three upstream binaries collapsed into `moe-flight <namespace>`, so a
# `serve` command from compose becomes `moe-flight qa serve`.
ENTRYPOINT ["node", "dist/cli.js", "qa"]
