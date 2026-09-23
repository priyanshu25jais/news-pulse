import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import ClusterDetail from './components/ClusterDetail';
import RefreshButton from './components/RefreshButton';
import SourceFilter from './components/SourceFilter';
import Timeline from './components/Timeline';

const DAYS_SHOWN = 7;
const AUTO_REFRESH_MS = 60_000;

export default function App() {
  const [timeline, setTimeline] = useState(null);
  const [allSources, setAllSources] = useState([]);
  const [selectedSources, setSelectedSources] = useState(null); // null = all sources
  const [selectedClusterId, setSelectedClusterId] = useState(null);
  const [error, setError] = useState(null);

  const loadTimeline = useCallback(async () => {
    try {
      const from = new Date(Date.now() - DAYS_SHOWN * 86_400_000).toISOString();
      const data = await api.timeline(selectedSources, from);
      setTimeline(data);
      setAllSources(data.sources);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [selectedSources]);

  useEffect(() => {
    loadTimeline();
    const timer = setInterval(loadTimeline, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadTimeline]);

  return (
    <div className={selectedClusterId ? 'layout with-detail' : 'layout'}>
      <main>
        <header>
          <div>
            <h1>News Pulse</h1>
            <p className="muted">News from {allSources.length} outlets, grouped into topics over the last {DAYS_SHOWN} days.</p>
          </div>
          <RefreshButton onDone={loadTimeline} />
        </header>

        <SourceFilter allSources={allSources} selected={selectedSources} onChange={setSelectedSources} />

        <section className="card">
          {error && <p className="error">{error}</p>}
          {!timeline && !error && <p className="muted center">Loading timeline…</p>}
          {timeline && (
            <Timeline
              items={timeline.items}
              allSources={allSources}
              selectedId={selectedClusterId}
              onSelect={(id) => setSelectedClusterId(id === selectedClusterId ? null : id)}
            />
          )}
        </section>
      </main>

      {selectedClusterId && (
        <ClusterDetail
          clusterId={selectedClusterId}
          sources={selectedSources}
          allSources={allSources}
          onClose={() => setSelectedClusterId(null)}
        />
      )}
    </div>
  );
}
