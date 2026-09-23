import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scraperDir = process.env.SCRAPER_DIR || path.join(repoRoot, 'scraper');

// Locally, use the Python inside scraper/.venv (it has the scraper's packages installed).
// On Render, PYTHON_BIN is set in the Dockerfile.
function findPython() {
  if (process.env.PYTHON_BIN) return process.env.PYTHON_BIN;
  const venvPython = process.platform === 'win32'
    ? path.join(scraperDir, '.venv', 'Scripts', 'python.exe')
    : path.join(scraperDir, '.venv', 'bin', 'python');
  if (fs.existsSync(venvPython)) return venvPython;
  return process.platform === 'win32' ? 'python' : 'python3';
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB || 'newspulse',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  pythonBin: findPython(),
  scraperDir,
};

if (!config.mongoUri) {
  console.error('MONGODB_URI is not set - add it to backend/.env');
  process.exit(1);
}
