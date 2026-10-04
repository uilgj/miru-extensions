// ==MiruExtension==
// @name         CNFLIX
// @version      v0.0.3
// @author       you
// @lang         zh-cn
// @license      MIT
// @icon         https://www.cnflix.tv/favicon.ico
// @package      cnflix.tv
// @type         bangumi
// @webSite      https://www.cnflix.tv
// @nsfw         false
// ==/MiruExtension==
export default class extends Extension {
  genres = {
    "tv": "剧集",
    "movies": "电影",
    "varietyshow": "综艺",
    "anime": "动漫",
    "shortdrama": "短剧",
    "krdrama": "韩剧",
    "documentaries": "纪录片",
  };

  // 手写 Base64 解码，避免依赖 atob
  b64decode(input) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let str = String(input).replace(/[^A-Za-z0-9+/=]/g, "").replace(/=+$/, "");
    let output = "";
    let bc = 0, bs = 0, buffer, i = 0;
    while ((buffer = str.charAt(i++))) {
      buffer = chars.indexOf(buffer);
      if (buffer === -1) continue;
      bs = bc % 4 ? bs * 64 + buffer : buffer;
      if (bc++ % 4) {
        output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
      }
    }
    return output;
  }

  async load() {}

  async createFilter() {
    return {
      genres: { title: "类型", max: 1, min: 0, default: "", options: this.genres },
    };
  }

  parseList(res) {
    const items = [];
    const seen = new Set();
    const linkRe = /<a class="public-list-exp" href="(?:\/detail\/|\/\/www\.cnflix\.tv\/detail\/)(\d+)\/"([^>]*)>/g;
    let m;
    while ((m = linkRe.exec(res))) {
      const id = m[1];
      if (seen.has(id)) continue;
      seen.add(id);
      const attrs = m[2] || "";
      const titleAttr = attrs.match(/title="([^"]+)"/);
      const start = linkRe.lastIndex;
      const slice = res.substr(start, 1500);
      const coverM = slice.match(/data-original="([^"]+)"/);
      const cover = coverM ? coverM[1] : "";
      let title = titleAttr ? titleAttr[1] : "";
      if (!title) {
        const tm = slice.match(/<div class="thumb-txt[^"]*">([^<]+)<\/div>/);
        if (tm) title = tm[1].trim();
      }
      if (!title) title = id;
      items.push({ title, url: id, cover });
    }
    return items;
  }

  async latest(page) {
    const url = page > 1 ? `/map/${page}/` : "/";
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.cnflix.tv" },
    });
    return this.parseList(res);
  }

  async search(kw, page, filter) {
    const type = filter?.genres?.[0] ?? "";
    let url;
    if (!kw && type) url = `/type/${type}/`;
    else url = `/vodsearch/?wd=${encodeURIComponent(kw)}`;
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.cnflix.tv" },
    });
    return this.parseList(res);
  }

  async detail(id) {
    const res = await this.request(`/detail/${id}/`, {
      headers: { "Miru-Url": "https://www.cnflix.tv" },
    });
    const title = (res.match(/<h2 class="slide-info-title[^"]*">([^<]+)<\/h2>/) || [])[1] || "";
    const cover = (res.match(/class="detail-pic lazy mask-1"\s+data-original="([^"]+)"/) || [])[1] || "";
    let desc = (res.match(/<div id="height_limit"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || "";
    desc = desc.replace(/<[^>]+>/g, "").trim();

    const sourceNames = [];
    const srcRe = /<option[^>]*>([^<]+?)\s*（\d+）<\/option>/g;
    let sm;
    while ((sm = srcRe.exec(res))) sourceNames.push(sm[1].trim());

    const episodes = [];
    const boxRe = /<div class='anthology-list-box[^']*'>([\s\S]*?)<\/ul>/g;
    let bm, idx = 0;
    while ((bm = boxRe.exec(res))) {
      const blockHtml = bm[1];
      const urls = [];
      const epRe = /<a class="hide[^"]*"\s+href="(\/play\/\d+-\d+-\d+\/)">\s*([^<]+?)\s*<\/a>/g;
      let em;
      while ((em = epRe.exec(blockHtml))) {
        urls.push({ name: em[2].trim(), url: em[1] });
      }
      if (urls.length) {
        episodes.push({ title: sourceNames[idx] || `源${idx + 1}`, urls });
        idx++;
      }
    }
    return { title, cover, desc, episodes };
  }

  // ⭐ 关键改动：用手写 b64decode 代替 atob
  async watch(url) {
    const res = await this.request(url, {
      headers: { "Miru-Url": "https://www.cnflix.tv" },
    });
    const m = res.match(/var player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (!m) {
      console.log("[CNFLIX] player_aaaa not found");
      return { type: "hls", url: "" };
    }
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      console.log("[CNFLIX] JSON parse error:", e);
      return { type: "hls", url: "" };
    }

    let real = data.url;
    console.log("[CNFLIX] raw:", real);

    // Step 1: Base64 解码
    try {
      real = this.b64decode(real);
      console.log("[CNFLIX] after b64:", real);
    } catch (e) {
      console.log("[CNFLIX] b64 error:", e);
    }

    // Step 2: URL 解码
    try {
      real = decodeURIComponent(real);
      console.log("[CNFLIX] after decodeURI:", real);
    } catch (e) {
      console.log("[CNFLIX] decodeURI error:", e);
    }

    return { type: "hls", url: real };
  }
}