// ==MiruExtension==
// @name         SSRFun动漫
// @version      v0.0.3
// @author       you
// @lang         zh-cn
// @license      MIT
// @icon         https://www.ssrfun.com/favicon.ico?v=20260713
// @package      ssrfun.com
// @type         bangumi
// @webSite      https://www.ssrfun.com
// @nsfw         false
// ==/MiruExtension==
export default class extends Extension {
  baseUrl = "https://www.ssrfun.com";
  ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  genres = {
    "1": "番剧",
    "2": "剧场",
    "20": "特摄",
    "21": "舞台剧",
  };

  async load() {}

  async createFilter() {
    return {
      genres: {
        title: "影片类型",
        max: 1,
        min: 0,
        default: "",
        options: this.genres,
      },
    };
  }

  headers() {
    return {
      "Miru-Url": this.baseUrl,
      "User-Agent": this.ua,
      "Referer": this.baseUrl + "/",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    };
  }

  async fetch(path) {
    return await this.request(path, { headers: this.headers() });
  }

  // 按卡片容器切分 HTML，逐块提取。兼容搜索页的 <article class="card"> 和
  // 首页/分类页的 <div class="b-card">
  parseList(res) {
    const items = [];
    const seen = new Set();

    // 找出所有卡片容器的起始位置
    const markers = [];
    const markerRe = /<(?:div|article)\s+class="(?:b-card|card)(?:\s+[^"]*)?"[^>]*>/g;
    let m;
    while ((m = markerRe.exec(res))) {
      markers.push(m.index + m[0].length);
    }

    for (let i = 0; i < markers.length; i++) {
      const start = markers[i];
      const end = i + 1 < markers.length ? markers[i + 1] : res.length;
      const chunk = res.slice(start, Math.min(end, start + 4000));

      // 详情链接
      const linkMatch = chunk.match(/href="(\/voddetail\/[^"]+)"/);
      if (!linkMatch) continue;
      const url = linkMatch[1];
      if (seen.has(url)) continue;

      // 标题：优先 card-title/b-card-title 里的文本
      let title = "";
      const titleMatch = chunk.match(/class="(?:b-card-title|card-title)(?:\s+[^"]*)?"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/);
      if (titleMatch) title = titleMatch[1].trim();
      // 兜底：用 img 的 alt 属性（去掉"封面"后缀）
      if (!title) {
        const altMatch = chunk.match(/<img[^>]*alt="([^"]+)"/);
        if (altMatch) {
          title = altMatch[1].replace(/[-－]动漫封面$/, "").replace(/\s*封面$/, "").trim();
        }
      }

      // 封面
      const coverMatch = chunk.match(/<img[^>]*src="([^"]+)"/);
      const cover = coverMatch ? coverMatch[1] : "";

      if (!title) continue;
      seen.add(url);
      items.push({ title, url, cover });
    }

    return items;
  }

  async latest(page) {
    // 直接用首页，首页肯定有 b-card 结构
    const url = page > 1 ? `/?page=${page}` : "/";
    const res = await this.fetch(url);
    return this.parseList(res);
  }

  async search(kw, page, filter) {
    const type = filter?.genres?.[0] ?? "";
    let url;
    if (!kw && type) {
      url = page > 1 ? `/vodtype/${type}-${page}.html` : `/vodtype/${type}.html`;
    } else {
      // 关键词直接拼路径，让 Miru 内部做 URL 编码
      url = `/vodsearch/${kw}-------------.html`;
    }
    const res = await this.fetch(url);
    return this.parseList(res);
  }

  async detail(url) {
    const res = await this.fetch(url);

    const titleMatch = res.match(/<h1 class="bili-title">\s*([^<\n]+)/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const coverMatch = res.match(/<div class="bili-cover">\s*<img src="([^"]+)"/);
    const cover = coverMatch ? coverMatch[1] : "";

    const descMatch = res.match(/<div class="bili-desc">\s*简介：([\s\S]*?)<\/div>/);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";

    // 剧集：先抓整段 URL，再用后缀解析 sid/nid
    const sidMap = {};
    const epSeen = new Set();
    const epRe = /<a\s+href="(\/vodplay\/[^"]+)"[^>]*?title="([^"]+)"/g;
    let em;
    while ((em = epRe.exec(res))) {
      const epUrl = em[1];
      const name = em[2].trim();
      const urlMatch = epUrl.match(/-(\d+)-(\d+)\.html$/);
      if (!urlMatch) continue;
      const sid = urlMatch[1];
      if (epSeen.has(epUrl)) continue;
      epSeen.add(epUrl);
      if (!sidMap[sid]) sidMap[sid] = [];
      sidMap[sid].push({ name, url: epUrl });
    }

    // 线路名：只抓带 <small> 的 section-title（线路专属）
    const lineNames = [];
    const lineRe = /<div class="section-title">\s*([^<\n]+?)\s*<small/g;
    let lm;
    while ((lm = lineRe.exec(res))) {
      lineNames.push(lm[1].trim());
    }

    const episodes = [];
    const sids = Object.keys(sidMap).sort((a, b) => parseInt(a) - parseInt(b));
    for (let i = 0; i < sids.length; i++) {
      episodes.push({
        title: lineNames[i] || `线路${sids[i]}`,
        urls: sidMap[sids[i]],
      });
    }

    return { title, cover, desc, episodes };
  }

  async watch(url) {
    const res = await this.fetch(url);

    const m = res.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (!m) return { type: "hls", url: "" };

    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      return { type: "hls", url: "" };
    }

    let playUrl = data.url || "";
    if (!playUrl) return { type: "hls", url: "" };

    if (String(data.encrypt) === "1") {
      try { playUrl = decodeURIComponent(playUrl); } catch (e) {}
    }

    return { type: "hls", url: playUrl };
  }
}