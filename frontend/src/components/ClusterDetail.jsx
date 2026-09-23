import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate, sourceColor } from '../utils';

export default function ClusterDetail({ clusterId, sources, allSources, onClose }) {
  const [cluster, setCluster] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setCluster(null);
    setError(null);
    api.cluster(clusterId, sources).then(setCluster).catch((err) => setError(err.message));
  }, [clusterId, sources]);

  return (
    <aside className="detail">
      <button className="close" onClick={onClose} aria-label="Close">✕</button>
      {error && <p className="error">{error}</p>}
      {!cluster && !error && <p className="muted">Loading…</p>}

      {cluster && (
        <>
          <h2>{cluster.label}</h2>
          <p className="muted">
            {cluster.articleCount} articles · {formatDate(cluster.timeRange.start)} → {formatDate(cluster.timeRange.end)}
          </p>

          <ol className="articles">
            {cluster.articles.map((article) => (
              <li key={article.id}>
                <div className="meta">
                  <i style={{ background: sourceColor(article.source, allSources) }} />
                  <b>{article.source}</b> · {formatDate(article.publishedAt)}
                </div>
                <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title} ↗</a>
              </li>
            ))}
          </ol>
        </>
      )}
    </aside>
  );
}
