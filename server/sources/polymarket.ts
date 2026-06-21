interface PolymarketEvent {
  id: string
  slug: string
  title: string
  volume24hr?: number | string
  volume?: number | string
}

function formatVolume(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B Vol`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M Vol`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K Vol`
  return `$${Math.round(v)} Vol`
}

export default defineSource(async () => {
  // Polymarket has no RSS; its Gamma API exposes events as JSON.
  const url = "https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=30"
  const events = await myFetch<PolymarketEvent[]>(url)
  return events
    .filter(e => e.title && e.slug)
    .map(e => ({
      id: e.id ?? e.slug,
      title: e.title.trim(),
      url: `https://polymarket.com/event/${e.slug}`,
      extra: {
        info: formatVolume(Number(e.volume24hr ?? e.volume ?? 0)),
      },
    }))
})
