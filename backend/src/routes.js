import { Router } from 'express';
import { getCluster, getTimeline, listClusters } from './clusters.js';
import { getJob, getRunningJobId, startPipeline } from './jobs.js';

export const router = Router();

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Passes errors from async handlers to the error handler in server.js.
const handle = (fn) => (req, res, next) => fn(req, res).catch(next);

// ---- query validation ----
function readFilters(query) {
  const filters = { sources: null, minSize: 2, from: null };

  if (query.sources !== undefined) {
    filters.sources = String(query.sources).split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (query.minSize !== undefined) {
    const n = Number(query.minSize);
    if (!Number.isInteger(n) || n < 1) throw new HttpError(400, 'minSize must be a whole number of at least 1');
    filters.minSize = n;
  }
  if (query.from !== undefined) {
    const date = new Date(query.from);
    if (Number.isNaN(date.getTime())) throw new HttpError(400, 'from must be a date, e.g. 2026-09-20T00:00:00Z');
    filters.from = date;
  }
  return filters;
}

function readClusterId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'cluster id must be a positive whole number');
  return id;
}

// ---- endpoints ----
router.get('/', (req, res) => {
  res.json({
    name: 'News Pulse API',
    endpoints: [
      'GET /clusters?sources=BBC News,NPR&minSize=2',
      'GET /clusters/:id?sources=',
      'GET /timeline?sources=&minSize=2&from=2026-09-20T00:00:00Z',
      'POST /ingest/trigger',
      'GET /ingest/status/:jobId',
    ],
  });
});

router.get('/clusters', handle(async (req, res) => {
  res.json({ clusters: await listClusters(readFilters(req.query)) });
}));

router.get('/clusters/:id', handle(async (req, res) => {
  const id = readClusterId(req.params.id);
  const cluster = await getCluster(id, readFilters(req.query));
  if (!cluster) throw new HttpError(404, `cluster ${id} not found`);
  res.json(cluster);
}));

router.get('/timeline', handle(async (req, res) => {
  res.json(await getTimeline(readFilters(req.query)));
}));

router.post('/ingest/trigger', (req, res) => {
  const running = getRunningJobId();
  if (running) {
    return res.status(409).json({ error: 'the pipeline is already running', jobId: running });
  }
  const jobId = startPipeline();
  res.status(202).json({ jobId, status: 'running' });
});

router.get('/ingest/status/:jobId', (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) throw new HttpError(404, 'job not found');
  res.json(job);
});
