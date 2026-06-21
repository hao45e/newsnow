interface Res {
  topic_list: {
    can_create_topic: boolean
    more_topics_url: string
    per_page: number
    top_tags: string[]
    topics: {
      id: number
      title: string
      fancy_title: string
      posts_count: number
      reply_count: number
      highest_post_number: number
      image_url: null | string
      created_at: Date
      last_posted_at: Date
      bumped: boolean
      bumped_at: Date
      unseen: boolean
      pinned: boolean
      excerpt?: string
      visible: boolean
      closed: boolean
      archived: boolean
      like_count: number
      has_summary: boolean
      last_poster_username: string
      category_id: number
      pinned_globally: boolean
    }[]
  }
}

// linux.do sits behind Cloudflare and rejects plain bot-looking requests, so
// send realistic browser headers and prime the request with cookies obtained
// from the homepage (same trick as xueqiu/douyin).
const browserHeaders = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Referer": "https://linux.do/",
  "X-Requested-With": "XMLHttpRequest",
  "Discourse-Present": "true",
  "sec-ch-ua": "\"Chromium\";v=\"130\", \"Google Chrome\";v=\"130\", \"Not?A_Brand\";v=\"99\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Windows\"",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
}

async function fetchTopics(url: string): Promise<Res> {
  let cookie = ""
  try {
    const homepage = await $fetch.raw("https://linux.do/", { headers: browserHeaders })
    cookie = homepage.headers.getSetCookie().join("; ")
  } catch {
    // homepage may itself be challenged; fall back to a cookie-less request
  }
  return myFetch<Res>(url, {
    headers: cookie ? { ...browserHeaders, cookie } : browserHeaders,
  })
}

const hot = defineSource(async () => {
  const res = await fetchTopics("https://linux.do/top/daily.json")
  return res.topic_list.topics
    .filter(k => k.visible && !k.archived && !k.pinned)
    .map(k => ({
      id: k.id,
      title: k.title,
      url: `https://linux.do/t/topic/${k.id}`,
    }))
})

const latest = defineSource(async () => {
  const res = await fetchTopics("https://linux.do/latest.json?order=created")
  return res.topic_list.topics
    .filter(k => k.visible && !k.archived && !k.pinned)
    .map(k => ({
      id: k.id,
      title: k.title,
      pubDate: new Date(k.created_at).valueOf(),
      url: `https://linux.do/t/topic/${k.id}`,
    }))
})

export default defineSource({
  "linuxdo": latest,
  "linuxdo-latest": latest,
  "linuxdo-hot": hot,
})
