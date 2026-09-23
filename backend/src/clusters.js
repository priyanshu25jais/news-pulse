import { articles, clusters } from './db.js';

// Counts and time ranges are calculated from the articles that match the filters,
// so hiding a source also shrinks the clusters on the timeline.
function groupByCluster({ sources, minSize, from }, extraFields = {}) {
  const match = { cluster_id: { $ne: null } };
  if (sources) match.source = { $in: sources };
  if (from) match.published_at = { $gte: from };

  return [
    { $match: match },
    {
      $group: {
        _id: '$cluster_id',
        articleCount: { $sum: 1 },
        sources: { $addToSet: '$source' },
        start: { $min: '$published_at' },
        end: { $max: '$published_at' },
        ...extraFields,
      },
    },
    { $match: { articleCount: { $gte: minSize } } },
  ];
}

// Adds label / top terms / representative headline from the clusters collection.
async function withLabels(rows) {
  const docs = await clusters().find({ _id: { $in: rows.map((r) => r._id) } }).toArray();
  const byId = new Map(docs.map((d) => [d._id, d]));
  return rows
    .filter((r) => byId.has(r._id))
    .map((r) => ({ ...r, info: byId.get(r._id) }));
}

export async function listClusters(filters) {
  const rows = await articles()
    .aggregate([...groupByCluster(filters), { $sort: { end: -1 } }])
    .toArray();

  return (await withLabels(rows)).map((r) => ({
    id: r._id,
    label: r.info.label,
    articleCount: r.articleCount,
    sources: r.sources.sort(),
    timeRange: { start: r.start, end: r.end },
  }));
}

export async function getCluster(id, { sources }) {
  const cluster = await clusters().findOne({ _id: id });
  if (!cluster) return null;

  const filter = { cluster_id: id };
  if (sources) filter.source = { $in: sources };
  const list = await articles()
    .find(filter, { projection: { title: 1, source: 1, url: 1, published_at: 1 } })
    .sort({ published_at: 1 })
    .toArray();

  return {
    id: cluster._id,
    label: cluster.label,
    topTerms: cluster.top_terms,
    representativeTitle: cluster.representative_title,
    articleCount: list.length,
    timeRange: { start: list[0]?.published_at ?? null, end: list.at(-1)?.published_at ?? null },
    articles: list.map((a) => ({
      id: a._id.toString(),
      title: a.title,
      source: a.source,
      publishedAt: a.published_at,
      url: a.url,
    })),
  };
}

// Timeline shape for a chart: one item per cluster with start/end, a size metric
// (intensity 0-1) and the time of every article (points) to draw on the bar.
export async function getTimeline(filters) {
  const rows = await articles()
    .aggregate([
      ...groupByCluster(filters, { points: { $push: { time: '$published_at', source: '$source' } } }),
      { $sort: { start: 1 } },
    ])
    .toArray();

  const items = await withLabels(rows);
  const maxCount = Math.max(1, ...items.map((r) => r.articleCount));

  return {
    sources: (await articles().distinct('source')).sort(),
    items: items.map((r) => ({
      id: r._id,
      label: r.info.label,
      representativeTitle: r.info.representative_title,
      start: r.start,
      end: r.end,
      articleCount: r.articleCount,
      // log scale so one very big story doesn't make every other bar tiny
      intensity: maxCount > 1 ? Math.log1p(r.articleCount) / Math.log1p(maxCount) : 1,
      points: r.points.sort((a, b) => a.time - b.time),
    })),
  };
}
