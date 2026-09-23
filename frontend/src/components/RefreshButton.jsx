import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

// Starts the pipeline, checks its status every 2 seconds, and reloads the timeline when done.
export default function RefreshButton({ onDone }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const poll = (jobId) => {
    timer.current = setTimeout(async () => {
      try {
        const job = await api.ingestStatus(jobId);
        if (job.status === 'running') return poll(jobId);
        setRunning(false);
        if (job.status === 'succeeded') {
          setMessage(`Done: ${job.result.ingest.new_articles} new articles`);
          onDone();
        } else {
          setMessage(`Refresh failed: ${job.error}`);
        }
      } catch (err) {
        setRunning(false);
        setMessage(err.message);
      }
    }, 2000);
  };

  const start = async () => {
    setMessage('');
    setRunning(true);
    try {
      const { jobId } = await api.triggerIngest();
      poll(jobId);
    } catch (err) {
      if (err.status === 409) return poll(err.data.jobId); // already running: follow that job
      setRunning(false);
      setMessage(err.message);
    }
  };

  return (
    <div className="refresh">
      <button className="primary" onClick={start} disabled={running}>
        {running ? 'Refreshing… (up to 1–2 min)' : '↻ Refresh data'}
      </button>
      {message && <small>{message}</small>}
    </div>
  );
}
