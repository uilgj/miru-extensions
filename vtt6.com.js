// ==MiruExtension==
// @name         樱花动漫 (vtt6)
// @version      v0.0.2
// @author       you
// @lang         zh-cn
// @license      MIT
// @icon         https://www.vtt6.com/favicon.ico
// @package      vtt6.com
// @type         bangumi
// @webSite      https://www.vtt6.com
// @nsfw         false
// ==/MiruExtension==
export default class extends Extension {
  genres = {
    "guoman": "国产动漫",
    "riman": "日本动漫",
    "oman": "欧美动漫",
    "dmfilm": "动漫电影",
  };

  sourceNames = {
    "1": "高清",
    "3": "ikun",
    "2": "非凡",
    "4": "量子",
  };

  async load() {}

  async createFilter() {
    return {
      genres: {
        title: "动漫类型",
        max: 1,
        min: 0,
        default: "",
        options: this.genres,
      },
    };
  }

  // ⭐ 关键修复：允许 <a> 和 href 之间有任意属性
  parseList(res) {
    const items = [];
    const re = /<a[^>]*href="\/detail\/(\d+)\/"[^>]*title="([^"]+)"[^>]*>\s*<img class="lazy" data-original="([^"]+)"/g;
    let m;
    while ((m = re.exec(res))) {
      items.push({
        title: m[2],
        url: m[1],
        cover: m[3],
      });
    }
    return items;
  }

  async latest(page) {
    const url = page > 1 ? `/page/${page}/` : "/";
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.vtt6.com" },
    });
    return this.parseList(res);
  }

  async search(kw, page, filter) {
    const type = filter?.genres?.[0] ?? "";
    let url;
    if (!kw && type) {
      url = `/type/${type}/`;
    } else {
      url = `/search/?wd=${encodeURIComponent(kw)}`;
    }
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.vtt6.com" },
    });
    return this.parseList(res);
  }

  async detail(id) {
    const res = await this.request(`/detail/${id}/`, {
      headers: { "Miru-Url": "https://www.vtt6.com" },
    });

    const title = (res.match(/<h2>([^<]+)<\/h2>/) || [])[1] || "";
    const cover = (res.match(/<div class="cover">\s*<img class="lazy" data-original="([^"]+)"/) || [])[1] || "";
    const desc = (res.match(/<li class="blurb"><span>[^<]*<\/span>([\s\S]*?)<\/li>/) || [])[1]?.trim() || "";

    const episodes = [];
    const rowRe = /<div class="row"[^>]*>\s*<ul class="list6">([\s\S]*?)<\/ul>/g;
    const rows = [];
    let rm;
    while ((rm = rowRe.exec(res))) {
      rows.push(rm[1]);
    }

    for (const rowHtml of rows) {
      const urls = [];
      const epRe = /<a href="\/play\/(\d+)-(\d+)-(\d+)\/">([^<]+)<\/a>/g;
      let em;
      while ((em = epRe.exec(rowHtml))) {
        urls.push({ name: em[4].trim(), url: `/play/${em[1]}-${em[2]}-${em[3]}/` });
      }
      if (!urls.length) continue;
      const sidMatch = urls[0].url.match(/-(\d+)-/);
      const sid = sidMatch ? sidMatch[1] : "0";
      const sourceName = this.sourceNames[sid] || `源${sid}`;
      episodes.push({ title: sourceName, urls });
    }

    return { title, cover, desc, episodes };
  }

  async watch(url) {
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.vtt6.com" },
    });
    const m = res.match(/url:\s*['"]([^'"]+\.m3u8)['"]/);
    if (!m) return { type: "hls", url: "" };
    return { type: "hls", url: m[1] };
  }
}