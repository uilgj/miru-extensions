// ==MiruExtension==
// @name         看戏影院
// @version      v0.0.1
// @author       you
// @lang         zh-cn
// @license      MIT
// @icon         https://www.kanxige.com/favicon.ico
// @package      kanxige.com
// @type         bangumi
// @webSite      https://www.kanxige.com
// @nsfw         false
// ==/MiruExtension==
export default class extends Extension {
  genres = {
    "1": "电影",
    "2": "电视剧",
    "3": "综艺",
    "4": "动漫",
    "5": "榜单",
    "6": "最近",
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
    const re = /<a class="stui-vodlist__thumb[^"]*"\s+href="(\/post\/\d+\.html)"\s+title="([^"]+)"\s+data-original="([^"]+)"/g;
    let m;
    while ((m = re.exec(res))) {
      items.push({
        title: m[2],
        url: m[1].match(/\d+/)[0],
        cover: m[3],
      });
    }
    return items;
  }

  async latest(page) {
    const url = page > 1 ? `/list/6-${page}.html` : `/list/6.html`;
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.kanxige.com" },
    });
    return this.parseList(res);
  }

  async search(kw, page, filter) {
    const type = filter?.genres?.[0] ?? "";
    let url;
    if (!kw && type) {
      url = page > 1 ? `/list/${type}-${page}.html` : `/list/${type}.html`;
    } else {
      url = `/search/${encodeURIComponent(kw)}-------------.html`;
    }
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.kanxige.com" },
    });
    return this.parseList(res);
  }

  async detail(id) {
    const res = await this.request(`/post/${id}.html`, {
      headers: { "Miru-Url": "https://www.kanxige.com" },
    });
    const title = (res.match(/<h1 class="title">([^<]+)<\/h1>/) || [])[1] || "";
    const cover = (res.match(/<img class="lazyload" data-original="([^"]+)"/) || [])[1] || "";
    const desc = (res.match(/<span class="detail-content"[^>]*>([\s\S]*?)<\/span>/) || [])[1] || "";

    const episodes = [];
    const blockRe = /<h4>\s*<i[^>]*><\/i>\s*&ensp;([^<]+)\s*<\/h4>([\s\S]*?)<\/ul>/g;
    let bm;
    while ((bm = blockRe.exec(res))) {
      const sourceName = bm[1].trim();
      const blockHtml = bm[2];
      const urls = [];
      const epRe = /<a href="(\/play\/\d+-\d+-\d+\.html)">([^<]+)<\/a>/g;
      let em;
      while ((em = epRe.exec(blockHtml))) {
        urls.push({ name: em[2].trim(), url: em[1] });
      }
      if (urls.length) episodes.push({ title: sourceName, urls });
    }

    return { title, cover, desc, episodes };
  }

  async watch(url) {
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.kanxige.com" },
    });
    const m = res.match(/var player_data\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (!m) return { type: "hls", url: "" };
    const data = JSON.parse(m[1]);
    return { type: "hls", url: data.url };
  }
}