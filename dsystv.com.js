// ==MiruExtension==
// @name         袋鼠影视
// @version      v0.0.2
// @author       you
// @lang         zh-cn
// @license      MIT
// @icon         https://dsystv.com/favicon.ico
// @package      dsystv.com
// @type         bangumi
// @webSite      https://dsystv.com
// @nsfw         false
// ==/MiruExtension==
export default class extends Extension {
  baseUrl = "https://dsystv.com";

  genres = {
    "1": "电影",
    "2": "电视剧",
    "3": "综艺",
    "4": "动漫",
    "44": "短剧",
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

  parseList(res) {
    const items = [];
    const seen = new Set();
    // 找所有 videopic 链接，标题在 title 属性，封面在紧随其后的 img data-original
    const tagRe = /<a\s+class="videopic"[^>]*>/g;
    let m;
    while ((m = tagRe.exec(res))) {
      const tag = m[0];
      const urlMatch = tag.match(/href="(\/movie\/index\d+\.html)"/);
      const titleMatch = tag.match(/title="([^"]*)"/);
      if (!urlMatch || !titleMatch) continue;
      const url = urlMatch[1];
      if (seen.has(url)) continue;
      seen.add(url);
      // 向后截一段找封面
      const after = res.slice(m.index + tag.length, m.index + tag.length + 800);
      const coverMatch = after.match(/data-original="([^"]+)"/);
      items.push({
        title: titleMatch[1].trim(),
        url: url,
        cover: coverMatch ? coverMatch[1] : "",
      });
    }
    return items;
  }

  async latest(page) {
    // 首页，分页用 ?page=N
    const url = page > 1 ? `/?page=${page}` : "/";
    const res = await this.request(url, {
      headers: { "Miru-Url": this.baseUrl },
    });
    return this.parseList(res);
  }

  async search(kw, page, filter) {
    const type = filter?.genres?.[0] ?? "";
    let url;
    if (!kw && type) {
      url = page > 1 ? `/frim/index${type}.html?page=${page}` : `/frim/index${type}.html`;
    } else {
      url = `/search.php?searchword=${encodeURIComponent(kw)}&page=${page}`;
    }
    const res = await this.request(url, {
      headers: { "Miru-Url": this.baseUrl },
    });
    return this.parseList(res);
  }

  async detail(url) {
    const res = await this.request(url, {
      headers: { "Miru-Url": this.baseUrl },
    });

    const title = (res.match(/<h1 class="h4">([^<]+)<\/h1>/) || [])[1] || "";
    const cover = (res.match(/<a class="videopic"[^>]*>\s*<img[^>]*src="([^"]+)"/) || [])[1] || "";
    const desc = (res.match(/<div class="video-section-body video-plot"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/) || [])[1] || "";

    const episodes = [];
    const blockRe = /<div class="panel clearfix"[^>]*data-playlist-line="(\d+)"[^>]*>[\s\S]*?<span class="playlist-line-name">([^<]+)<\/span>[\s\S]*?<ul class="playlistlink[^"]*"[^>]*>([\s\S]*?)<\/ul>/g;
    let bm;
    while ((bm = blockRe.exec(res))) {
      const lineName = bm[2].trim();
      const blockHtml = bm[3];
      const urls = [];
      const epRe = /<li[^>]*><a title="([^"]+)" href="(\/play\/[^"]+\.html)"[^>]*>/g;
      let em;
      while ((em = epRe.exec(blockHtml))) {
        urls.push({ name: em[1].trim(), url: em[2] });
      }
      if (urls.length) episodes.push({ title: lineName, urls });
    }

    return { title, cover, desc, episodes };
  }

  async watch(url) {
    const res = await this.request(url, {
      headers: { "Miru-Url": this.baseUrl },
    });

    // 优先匹配 player_aaaa
    const m = res.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        if (data.url) return { type: "hls", url: data.url };
      } catch (e) {}
    }

    // 兜底：直接找 m3u8
    const m3u8Match = res.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (m3u8Match) return { type: "hls", url: m3u8Match[1] };

    return { type: "hls", url: "" };
  }
}