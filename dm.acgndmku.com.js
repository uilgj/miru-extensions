// ==MiruExtension==
// @name         动漫库动漫
// @version      v0.0.1
// @author       you
// @lang         zh-cn
// @license      MIT
// @icon         https://dm.acgndmku.com/template/mxone/mxstatic/picture/logo.png
// @package      dm.acgndmku.com
// @type         bangumi
// @webSite      https://dm.acgndmku.com
// @nsfw         false
// ==/MiruExtension==
export default class extends Extension {
  baseUrl = "https://dm.acgndmku.com";
  ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  genres = {
    "1": "日本动漫",
    "2": "中国动漫",
    "4": "短剧",
    "7": "韩剧",
    "6": "日剧",
    "3": "动漫电影",
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

  parseList(res) {
    const items = [];
    const seen = new Set();

    // 搜索页的卡片结构
    const searchRe = /<div class="module-search-item">[\s\S]*?<h3><a href="(\/voddetail\/(\d+)\.html)"[^>]*>([^<]+)<\/a><\/h3>[\s\S]*?<img[^>]*data-src="([^"]+)"/g;
    let m;
    while ((m = searchRe.exec(res))) {
      if (seen.has(m[2])) continue;
      seen.add(m[2]);
      items.push({
        title: m[3].trim(),
        url: m[1],
        cover: m[4],
      });
    }

    // 分类/首页的卡片结构（module-item）
    if (items.length === 0) {
      const re = /<div class="module-item">[\s\S]*?<a href="(\/voddetail\/(\d+)\.html)"[^>]*title="([^"]+)"[\s\S]*?<img[^>]*data-src="([^"]+)"/g;
      while ((m = re.exec(res))) {
        if (seen.has(m[2])) continue;
        seen.add(m[2]);
        items.push({
          title: m[3].trim(),
          url: m[1],
          cover: m[4],
        });
      }
    }

    return items;
  }

  async latest(page) {
    const url = page > 1 ? `/vodtype/1-${page}.html` : `/vodtype/1.html`;
    const res = await this.fetch(url);
    return this.parseList(res);
  }

  async search(kw, page, filter) {
    const type = filter?.genres?.[0] ?? "";
    let url;
    if (!kw && type) {
      url = page > 1 ? `/vodtype/${type}-${page}.html` : `/vodtype/${type}.html`;
    } else {
      const q = encodeURIComponent(kw);
      url = page > 1
        ? `/vodsearch/-------------.html?wd=${q}&page=${page}`
        : `/vodsearch/-------------.html?wd=${q}`;
    }
    const res = await this.fetch(url);
    return this.parseList(res);
  }

  async detail(url) {
    const res = await this.fetch(url);

    // 标题
    const titleMatch = res.match(/<h1 class="page-title">([^<]+)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // 封面：从 video-cover 里抓
    const coverMatch = res.match(/<div class="video-cover">[\s\S]*?<img[^>]*(?:data-src|src)="([^"]+)"/);
    const cover = coverMatch ? coverMatch[1] : "";

    // 简介
    const descMatch = res.match(/<div class="video-info-item video-info-content vod_content">[\s\S]*?<span>([\s\S]*?)<\/span>/);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // 剧集：从 glist-N 里抓，N 就是 sid
    const sidMap = {};
    const glistRe = /<div class="module-list module-player-list tab-list sort-list[^"]*" id="glist-(\d+)">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    let gm;
    while ((gm = glistRe.exec(res))) {
      const sid = gm[1];
      const blockHtml = gm[2];
      const urls = [];
      const seen = new Set();
      const epRe = /<a href="(\/vodplay\/\d+-(\d+)-(\d+)\.html)"[^>]*title="([^"]+)"[^>]*>/g;
      let em;
      while ((em = epRe.exec(blockHtml))) {
        if (em[2] !== sid) continue; // 只取本 glist 对应 sid
        const epUrl = em[1];
        if (seen.has(epUrl)) continue;
        seen.add(epUrl);
        urls.push({ name: em[4].trim(), url: epUrl });
      }
      if (urls.length) {
        sidMap[sid] = urls;
      }
    }

    // 线路名映射：从 module-tab-content 里的 tab-item 抓
    const lineNames = {};
    const lineRe = /<a class="module-tab-item tab-item"[^>]*href="\/vodplay\/\d+-(\d+)-1\.html"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g;
    let lm;
    while ((lm = lineRe.exec(res))) {
      lineNames[lm[1]] = lm[2].trim();
    }
    // 当前线路（selected）没有 href，从 label 里取
    const curLineMatch = res.match(/<label class="module-tab-name"><span class="module-tab-value">([^<]+)<\/span>/);
    if (curLineMatch) {
      // 找当前 glist 的 sid
      const curSidMatch = res.match(/<div class="module-list module-player-list tab-list sort-list\s+selected[^"]*"\s+id="glist-(\d+)"/);
      if (curSidMatch) {
        lineNames[curSidMatch[1]] = curLineMatch[1].trim();
      }
    }

    const episodes = [];
    const sids = Object.keys(sidMap).sort((a, b) => parseInt(a) - parseInt(b));
    for (const sid of sids) {
      episodes.push({
        title: lineNames[sid] || `线路${sid}`,
        urls: sidMap[sid],
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

    // 这个站 encrypt:0，url 是明文，但为了保险还是做一次解码兼容
    if (/%[0-9A-Fa-f]{2}/.test(playUrl)) {
      try {
        playUrl = decodeURIComponent(playUrl);
      } catch (e) {}
    }

    return { type: "hls", url: playUrl };
  }
}