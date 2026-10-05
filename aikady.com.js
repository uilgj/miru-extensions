// ==MiruExtension==
// @name         爱卡电影网
// @version      v0.0.3
// @author       you
// @lang         zh-cn
// @license      MIT
// @icon         https://www.aikady.com/templets/gebi/images/img/favicon.ico
// @package      aikady.com
// @type         bangumi
// @webSite      https://www.aikady.com
// @nsfw         false
// ==/MiruExtension==
export default class extends Extension {
  baseUrl = "https://www.aikady.com";
  ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  genres = {
    "dianying": "电影",
    "dianshiju": "电视剧",
    "dongman": "动漫",
    "zongyi": "综艺",
    "duanju": "短剧",
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
    const re = /<li class="stui-vodlist__item"><a class="stui-vodlist__thumb lazyload" href="(\/show\/\d+\.html)" title="([^"]+)" data-original="([^"]+)"/g;
    let m;
    while ((m = re.exec(res))) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      items.push({
        title: m[2].trim(),
        url: m[1],
        cover: m[3],
      });
    }
    return items;
  }

  async latest(page) {
    const url = page > 1 ? `/category/dianying-${page}.html` : `/category/dianying.html`;
    const res = await this.fetch(url);
    return this.parseList(res);
  }

  async search(kw, page, filter) {
    const type = filter?.genres?.[0] ?? "";
    let url;
    if (!kw && type) {
      url = page > 1 ? `/category/${type}-${page}.html` : `/category/${type}.html`;
    } else {
      url = page > 1
        ? `/search.php?page=${page}&searchword=${encodeURIComponent(kw)}&searchtype=`
        : `/search.php?searchword=${encodeURIComponent(kw)}`;
    }
    const res = await this.fetch(url);
    return this.parseList(res);
  }

  async detail(url) {
    const res = await this.fetch(url);

    // 标题：剥掉后面的评分 span
    const titleMatch = res.match(/<h1 class="title">([^<]+)/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // 封面
    const coverMatch = res.match(/<div class="stui-content__thumb">[\s\S]*?<img[^>]*data-original="([^"]+)"/);
    const cover = coverMatch ? coverMatch[1] : "";

    // 简介
    const descMatch = res.match(/<div class="stui-content__desc"><p>([\s\S]*?)<\/p>/);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // 线路名映射：<a href="#playlist1" data-toggle="tab">云点播</a>
    const lineNames = {};
    const lineRe = /<a href="#playlist(\d+)" data-toggle="tab">([^<]+)<\/a>/g;
    let lm;
    while ((lm = lineRe.exec(res))) {
      lineNames[lm[1]] = lm[2].trim();
    }

    // 剧集：从 playlist 各 tab-pane 抓
    const episodes = [];
    const paneRe = /<div id="playlist(\d+)" class="tab-pane[^"]*">([\s\S]*?)<\/div>/g;
    let pm;
    while ((pm = paneRe.exec(res))) {
      const sid = pm[1];
      const blockHtml = pm[2];
      const urls = [];
      const epRe = /<li id="\d+"><a title="([^"]+)" href="(\/play\/\d+-\d+-\d+\.html)"/g;
      let em;
      while ((em = epRe.exec(blockHtml))) {
        urls.push({ name: em[1].trim(), url: em[2] });
      }
      if (urls.length) {
        episodes.push({ title: lineNames[sid] || `线路${sid}`, urls });
      }
    }

    return { title, cover, desc, episodes };
  }

  async watch(url) {
    const res = await this.fetch(url);

    // 播放页里 m3u8 明文存储在 var now="..."
    const nowMatch = res.match(/var\s+now\s*=\s*"([^"]+)"/);
    if (nowMatch && nowMatch[1]) {
      return { type: "hls", url: nowMatch[1] };
    }

    // 兜底：直接匹配 .m3u8
    const m3u8 = res.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (m3u8) return { type: "hls", url: m3u8[1] };

    return { type: "hls", url: "" };
  }
}