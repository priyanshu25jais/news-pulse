import { sourceColor } from '../utils';

export default function SourceFilter({ allSources, selected, onChange }) {
  const active = selected ?? allSources;

  const toggle = (source) => {
    const next = active.includes(source) ? active.filter((s) => s !== source) : [...active, source];
    onChange(next.length === allSources.length ? null : next);
  };

  return (
    <div className="sources">
      <span className="muted">Sources:</span>
      {allSources.map((source) => (
        <button
          key={source}
          className={active.includes(source) ? 'chip on' : 'chip'}
          style={{ '--color': sourceColor(source, allSources) }}
          onClick={() => toggle(source)}
        >
          <i /> {source}
        </button>
      ))}
    </div>
  );
}
