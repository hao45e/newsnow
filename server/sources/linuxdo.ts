// linux.do's JSON API (top/daily.json, latest.json) sits behind an aggressive
// Cloudflare challenge that blocks datacenter IPs (incl. Cloudflare Workers),
// so direct scraping fails with 403. Its Discourse RSS feeds, however, are left
// open for feed readers, so we read those instead — works from CF Pages too.
const latest = defineRSSSource("https://linux.do/latest.rss")
const hot = defineRSSSource("https://linux.do/top.rss?period=daily", { hiddenDate: true })

export default defineSource({
  "linuxdo": latest,
  "linuxdo-latest": latest,
  "linuxdo-hot": hot,
})
