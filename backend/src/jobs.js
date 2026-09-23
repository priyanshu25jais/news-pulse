import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const TIMEOUT_MS = 10 * 60 * 1000;
const jobs = new Map();
let runningJobId = null;

export const getJob = (id) => jobs.get(id);
export const getRunningJobId = () => runningJobId;

// Starts `python run.py` in the scraper folder and returns the job id right away.
export function startPipeline() {
  const id = randomUUID();
  const job = { id, status: 'running', startedAt: new Date(), finishedAt: null, result: null, error: null };
  jobs.set(id, job);
  runningJobId = id;

  let output = '';
  const child = spawn(config.pythonBin, ['run.py'], {
    cwd: config.scraperDir,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  child.stdout.on('data', (chunk) => (output = (output + chunk).slice(-20000)));
  child.stderr.on('data', (chunk) => (output = (output + chunk).slice(-20000)));
  const timer = setTimeout(() => child.kill(), TIMEOUT_MS);

  const finish = (error, exitCode) => {
    if (job.finishedAt) return;
    clearTimeout(timer);
    const line = output.split('\n').reverse().find((l) => l.startsWith('RESULT '));
    try {
      job.result = line ? JSON.parse(line.slice('RESULT '.length)) : null;
    } catch {
      job.result = null;
    }
    job.status = !error && job.result?.ok ? 'succeeded' : 'failed';
    if (job.status === 'failed') {
      // No RESULT line means Python crashed before finishing: show the end of its output.
      job.error = error?.message || job.result?.error
        || `python exited with code ${exitCode}: ${output.trim().slice(-400) || 'no output'}`;
    }
    job.finishedAt = new Date();
    runningJobId = null;
  };
  child.on('error', (error) => finish(error));
  child.on('close', (exitCode) => finish(null, exitCode));

  return id;
}
