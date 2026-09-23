# Backend image for Render. It contains Node (the API) and Python (the scraper),
# so POST /ingest/trigger can run the scraper directly.
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY scraper/requirements.txt scraper/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r scraper/requirements.txt
ENV PYTHON_BIN=/opt/venv/bin/python

COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev

COPY scraper scraper
COPY backend backend

ENV NODE_ENV=production PORT=4000
EXPOSE 4000
CMD ["node", "backend/src/server.js"]
