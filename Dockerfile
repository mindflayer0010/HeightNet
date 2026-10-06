# Build the React workspace first, then copy the compiled UI into the Python image.
FROM node:22-bookworm-slim AS workspace-build

WORKDIR /build
COPY portal/workspace-src/package.json portal/workspace-src/package-lock.json ./
RUN npm ci
COPY portal/workspace-src/ ./
RUN npm run build


FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# libgomp is needed by PyTorch. The small graphics libraries keep Pillow and
# torchvision usable for remote-sensing image previews inside the container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
COPY backend/ ./backend/
RUN python -m pip install --upgrade pip \
    && python -m pip install --only-binary=:all: ".[model,remote,preview]"

COPY configs/ ./configs/
COPY portal/ ./portal/
COPY reports/ ./reports/
COPY scripts/ ./scripts/
COPY viewer/ ./viewer/
COPY README.md DATA_AND_MODELS.md FEATURE_STATUS.md GETTING_STARTED.md ./

# The datasets, checkpoints, inputs, and generated outputs stay outside the
# image and are mounted from the host through docker-compose.yml.
RUN mkdir -p \
    data/checkpoints \
    data/gamus_raw/checkpoints \
    data/gamus_raw/images \
    data/gamus_raw/heights \
    data/gamus_raw/classes \
    data/inputs \
    data/outputs \
    data/references \
    data/portal_jobs

COPY --from=workspace-build /build/dist/ ./portal/workspace-src/dist/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

CMD ["python", "scripts/serve_portal.py", "--host", "0.0.0.0", "--port", "8000"]
