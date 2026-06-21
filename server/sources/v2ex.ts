interface Res {
  version: string
  title: string
  description: string
  home_page_url: string
  feed_url: string
  icon: string
  favicon: string
  items: {
    url: string
    date_modified?: string
    content_html: string
    date_published: string
    title: string
    id: string
  }[]
}

const share = defineSource(async () => {
  // v2ex sits behind Cloudflare and intermittently 403s requests from
  // datacenter IPs (e.g. CF Pages workers). Fetch each node independently and
  // keep whatever succeeds, so one blocked node doesn't fail the whole card.
  const results = await Promise.allSettled(["create", "ideas", "programmer", "share"]
    .map(k => myFetch(`https://www.v2ex.com/feed/${k}.json`) as Promise<Res>))
  const items = results
    .filter((r): r is PromiseFulfilledResult<Res> => r.status === "fulfilled")
    .flatMap(r => r.value.items)
  if (!items.length) throw new Error("Failed to fetch any v2ex feed")
  return items.map(k => ({
    id: k.id,
    title: k.title,
    extra: {
      date: k.date_modified ?? k.date_published,
    },
    url: k.url,
  })).sort((m, n) => m.extra.date < n.extra.date ? 1 : -1)
})

export default defineSource({
  "v2ex": share,
  "v2ex-share": share,
})
