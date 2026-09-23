import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { connectDb } from './db.js';
import { HttpError, router } from './routes.js';

const app = express();
app.use(cors({ origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',') }));
app.use(router);

app.use((req, res) => {
  res.status(404).json({ error: `no route for ${req.method} ${req.path}` });
});

app.use((err, req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

await connectDb();
app.listen(config.port, () => console.log(`API running on port ${config.port}`));
