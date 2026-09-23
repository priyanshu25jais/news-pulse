const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

async function request(path, options) {
  let response;
  try {
    response = await fetch(API_URL + path, options);
  } catch {
    throw new Error('Cannot reach the API. If it was asleep (free hosting), wait 30 seconds and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || `Request failed (${response.status})`), { data, status: response.status });
  return data;
}

function sourcesParam(sources) {
  return sources ? `sources=${encodeURIComponent(sources.join(','))}` : '';
}

export const api = {
  timeline: (sources, from) => request(`/timeline?minSize=2&from=${from}&${sourcesParam(sources)}`),
  cluster: (id, sources) => request(`/clusters/${id}?${sourcesParam(sources)}`),
  triggerIngest: () => request('/ingest/trigger', { method: 'POST' }),
  ingestStatus: (jobId) => request(`/ingest/status/${jobId}`),
};
