# remover cloud worker — an AWS Lambda container image that renders one frame-range
# segment to S3. Built per project (the project is baked in); deployed by `sam deploy`
# (see cloud/template.yaml). Container Lambda so we can ship chrome-headless-shell + the
# full remover runtime (vite/esbuild/puppeteer/mediabunny), which a zip layer can't hold.
#
#   build context is the repo root:  sam build  (uses cloud/Dockerfile)
#   override the project dir:         --build-arg PROJECT=./my-video
FROM public.ecr.aws/lambda/nodejs:20

# unzip/tar/findutils for the chrome-headless-shell download + chrome's shared
# libraries (Amazon Linux 2023). The base image is minimal — no unzip, no find. Fonts
# too: the base ships none, so any text (incl. `system-ui`) renders in a poor fallback.
RUN dnf install -y \
      unzip tar findutils \
      nss nspr atk at-spi2-atk at-spi2-core cups-libs libdrm libgbm mesa-libgbm \
      libxkbcommon libXcomposite libXdamage libXfixes libXrandr libXScrnSaver \
      alsa-lib pango cairo gtk3 \
      dejavu-sans-fonts dejavu-serif-fonts liberation-fonts google-noto-sans-fonts google-noto-emoji-fonts \
    && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}

# remover's renderer runtime (puppeteer-core, vite, @vitejs/plugin-react, esbuild,
# mediabunny, tsx) and the non-aliased packages compositions import (@remotion/google-
# fonts, @remotion/zod-types, zod, react) are all in dependencies, so a plain prod install.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# remover runtime: the renderer + the browser worker .ts files esbuild bundles at run
# time + the bin. tsx loads the TS directly (same as everywhere else in remover).
COPY tsconfig.json ./
COPY src ./src
COPY render ./render
COPY cloud ./cloud

# chrome writes its config/cache/NSS under $HOME; the Lambda task root is read-only, so
# point HOME at the writable /tmp.
ENV HOME=/tmp

# The user's project, baked in. REMOVER_ENTRY points the worker at its registerRoot.
ARG PROJECT=./project
COPY ${PROJECT} ./project
ENV REMOVER_ENTRY=${LAMBDA_TASK_ROOT}/project/src/index.ts

# chrome-headless-shell, pinned to the version remover renders with. Use remover's own
# chromeExecutable() so build and runtime agree on the cache dir (node_modules/.remover-
# chrome) and the binary is already present at invocation — no download in the Lambda.
# Chrome-for-Testing ships linux64 only — this image MUST be built for linux/amd64
# (--platform) and run as an x86_64 Lambda; arm64/Graviton can't execute the binary.
RUN node --import tsx -e "import('./render/browser.ts').then(m => m.chromeExecutable()).then(p => console.log('chrome installed:', p))"

# The AWS runtime interface client loads cloud/handler.mjs, which tsx-loads the TS handler.
CMD ["cloud/handler.handler"]
