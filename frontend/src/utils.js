const COLORS = ['#f2994a', '#22c55e', '#e5487d', '#a855f7', '#14b8a6', '#eab308'];

export function sourceColor(source, allSources) {
  return COLORS[Math.max(0, allSources.indexOf(source)) % COLORS.length];
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDate(value) {
  return value ? dateFormat.format(new Date(value)) : '';
}
