import { scaleTime } from 'd3-scale';
import { useEffect, useRef, useState } from 'react';
import { formatDate, sourceColor } from '../utils';

const ROW_HEIGHT = 44;
const AXIS_HEIGHT = 34;

// One row per topic. The bar runs from the first to the latest article,
// bar thickness grows with the number of articles, and each dot is one article.
export default function Timeline({ items, allSources, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(900);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!items.length) {
    return (
      <div ref={containerRef}>
        <p className="muted center">No topics with 2+ articles yet. Press “Refresh data”.</p>
      </div>
    );
  }

  const labelWidth = width < 700 ? 130 : 300;
  const chartWidth = Math.max(200, width - labelWidth);
  const now = new Date();
  const firstArticle = new Date(Math.min(...items.map((i) => new Date(i.start))));
  const padding = (now - firstArticle) * 0.03;
  const x = scaleTime()
    .domain([new Date(firstArticle - padding), new Date(+now + padding)])
    .range([12, chartWidth - 12]);
  const ticks = x.ticks(width < 700 ? 4 : 8);
  const tickFormat = x.tickFormat();
  const height = items.length * ROW_HEIGHT;

  const showTooltip = (item, event) => {
    const box = containerRef.current.getBoundingClientRect();
    setHovered({ item, x: event.clientX - box.left, y: event.clientY - box.top });
  };

  return (
    <div className="timeline" ref={containerRef} onMouseLeave={() => setHovered(null)}>
      <div className="timeline-grid" style={{ gridTemplateColumns: `${labelWidth}px ${chartWidth}px` }}>
        <div className="axis-title">Topic</div>
        <svg width={chartWidth} height={AXIS_HEIGHT} className="axis">
          {ticks.map((t) => (
            <text key={+t} x={x(t)} y={AXIS_HEIGHT - 12} textAnchor="middle">{tickFormat(t)}</text>
          ))}
        </svg>

        <ul className="labels">
          {items.map((item) => (
            <li key={item.id} style={{ height: ROW_HEIGHT }}>
              <button
                className={item.id === selectedId ? 'selected' : ''}
                onClick={() => onSelect(item.id)}
                onMouseEnter={(e) => showTooltip(item, e)}
              >
                <span>{item.label}</span>
                <small>{item.articleCount}</small>
              </button>
            </li>
          ))}
        </ul>

        <svg width={chartWidth} height={height}>
          {ticks.map((t) => (
            <line key={+t} x1={x(t)} x2={x(t)} y1={0} y2={height} className="grid-line" />
          ))}
          <line x1={x(now)} x2={x(now)} y1={0} y2={height} className="now-line" />

          {items.map((item, row) => {
            const y = row * ROW_HEIGHT + ROW_HEIGHT / 2;
            const x1 = x(new Date(item.start));
            const x2 = Math.max(x(new Date(item.end)), x1 + 8);
            const barHeight = 8 + 16 * item.intensity;
            return (
              <g key={item.id} className="row" onClick={() => onSelect(item.id)} onMouseMove={(e) => showTooltip(item, e)}>
                <rect x={0} y={row * ROW_HEIGHT} width={chartWidth} height={ROW_HEIGHT}
                  className={item.id === selectedId ? 'row-bg selected' : 'row-bg'} />
                <rect x={x1 - 5} y={y - barHeight / 2} width={x2 - x1 + 10} height={barHeight}
                  rx={barHeight / 2} className="bar" opacity={0.35 + 0.6 * item.intensity} />
                {item.points.map((p, i) => (
                  <circle key={i} cx={x(new Date(p.time))} cy={y} r={3.6} fill={sourceColor(p.source, allSources)} className="dot" />
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {hovered && (
        <div className="tooltip" style={{ left: Math.min(hovered.x + 14, width - 290), top: hovered.y + 16 }}>
          <strong>{hovered.item.label}</strong>
          <p>{hovered.item.representativeTitle}</p>
          <p>{hovered.item.articleCount} articles · {formatDate(hovered.item.start)} → {formatDate(hovered.item.end)}</p>
        </div>
      )}

      <div className="legend">
        <span><i className="legend-bar" /> first → latest article (thicker = more articles)</span>
        <span><i className="legend-dot" /> one article, coloured by source</span>
        <span><i className="legend-now" /> now</span>
      </div>
    </div>
  );
}
