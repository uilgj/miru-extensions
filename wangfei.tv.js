// ==MiruExtension==
// @name         网飞TV
// @version      v0.0.4
// @author       you
// @lang         zh-cn
// @license      MIT
// @icon         https://www.wangfei.tv/mxtheme/images/favicon.png
// @package      wangfei.tv
// @type         bangumi
// @webSite      https://www.wangfei.tv
// @nsfw         false
// ==/MiruExtension==
export default class extends Extension {
  baseUrl = "https://www.wangfei.tv";
  ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  genres = {
    "1": "电影", "2": "剧集", "3": "综艺", "4": "动漫", "5": "纪录", "47": "短剧",
  };

  async load() {}

  async createFilter() {
    return {
      genres: { title: "影片类型", max: 1, min: 0, default: "", options: this.genres },
    };
  }

  headers(host) {
    return {
      "Miru-Url": host,
      "User-Agent": this.ua,
      "Referer": this.baseUrl + "/",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    };
  }

  async fetch(path, host) {
    return await this.request(path, { headers: this.headers(host || this.baseUrl) });
  }

  parseList(res) {
    const items = [];
    const seen = new Set();
    const tagRe = /<a\s+[^>]*href="(?:https?:\/\/[^"\/]+)?\/voddetail\/(\d+)\.html"[^>]*>/g;
    let m;
    while ((m = tagRe.exec(res))) {
      const id = m[1];
      if (seen.has(id)) continue;
      const after = res.slice(m.index, m.index + 1200);
      const aTag = m[0];
      let title = "";
      const tMatch = aTag.match(/title="([^"]+)"/);
      if (tMatch) title = tMatch[1];
      const imgMatch = after.match(/<img[^>]*?(?:data-original|src)="([^"]+)"[^>]*?alt="([^"]*)"/);
      if (!title && imgMatch) title = imgMatch[2];
      if (!title) {
        const txtMatch = after.match(/>([^<>]{1,60})<\/a>/);
        if (txtMatch) title = txtMatch[1].trim();
      }
      const cover = imgMatch ? imgMatch[1] : "";
      if (!title) continue;
      seen.add(id);
      items.push({ title: title.trim(), url: `/voddetail/${id}.html`, cover });
    }
    return items;
  }

  async latest(page) {
    const url = page > 1 ? `/?page=${page}` : "/";
    return this.parseList(await this.fetch(url, this.baseUrl));
  }

  async search(kw, page, filter) {
    const type = filter?.genres?.[0] ?? "";
    let url;
    if (!kw && type) {
      url = page > 1 ? `/vodtype/${type}-${page}.html` : `/vodtype/${type}.html`;
    } else {
      const kwEnc = encodeURIComponent(kw);
      url = page > 1 ? `/vodsearch/wd/${kwEnc}/page/${page}.html` : `/vodsearch/wd/${kwEnc}.html`;
    }
    return this.parseList(await this.fetch(url, this.baseUrl));
  }

  async detail(url) {
    const res = await this.fetch(url, this.baseUrl);

    const titleMatch = res.match(/<span class="vod-title-main"[^>]*>([^<]+)<\/span>/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    const coverMatch = res.match(/<div class="module-info-poster">[\s\S]*?<img[^>]*(?:src|data-original)="([^"]+)"/);
    const cover = coverMatch ? coverMatch[1] : "";

    const descMatch = res.match(/<div class="module-info-introduction-content[^"]*">[\s\S]*?<p>([\s\S]*?)<\/p>/);
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    const idMatch = url.match(/\/voddetail\/(\d+)\.html/);
    const id = idMatch ? idMatch[1] : "";
    if (!id) return { title, cover, desc, episodes: [] };

    // 从 wangfei.tv 详情页提取 9 个镜像站域名
    const mirrorRe = /<a class="module-play-list-link"[^>]*href="(https?:\/\/([^\/"]+)\/voddetail\/\d+\.html[^"]*)"[^>]*>[\s\S]{0,300}?<span>([^<]+)<\/span>/g;
    const mirrors = [];
    let mm;
    while ((mm = mirrorRe.exec(res))) {
      mirrors.push({ host: "https://" + mm[2], name: mm[3].trim() });
    }
    // 兜底：如果正则没匹配到，直接用已知的镜像站
    if (mirrors.length === 0) {
      mirrors.push({ host: "https://www.158399.xyz", name: "线路1" });
    }

    const episodes = [];

    for (const mr of mirrors) {
      // 依次尝试该镜像站上的多个 sid
      for (const sid of [5, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]) {
        let playRes = "";
        try {
          playRes = await this.request(
            `/vodplay/${id}-${sid}-1.html?url=www.wangfei.tv`,
            { headers: this.headers(mr.host) }
          );
        } catch (e) {
          continue;
        }
        if (!playRes || !/module-play-list-link/.test(playRes)) continue;

        const sidToEps = {};
        const epRe = /href="([^"]*\/vodplay\/\d+-(\d+)-(\d+)\.html[^"]*)"[^>]*>[\s\S]{0,300}?<span>([^<]+)<\/span>/g;
        let em;
        while ((em = epRe.exec(playRes))) {
          const innerSid = em[2];
          let epUrl = em[1];
          if (!epUrl.startsWith("http")) epUrl = mr.host + epUrl;
          if (!sidToEps[innerSid]) sidToEps[innerSid] = [];
          if (sidToEps[innerSid].find((x) => x.url === epUrl)) continue;
          sidToEps[innerSid].push({ name: em[4].trim(), url: epUrl });
        }

        const sids = Object.keys(sidToEps).sort((a, b) => parseInt(a) - parseInt(b));
        if (sids.length === 0) continue;

        for (const s of sids) {
          episodes.push({ title: `${mr.name}-线路${s}`, urls: sidToEps[s] });
        }
        // 一个镜像站拿到就够，不用继续试下一个
        if (episodes.length > 0) break;
      }
      if (episodes.length > 0) break;
    }

    return { title, cover, desc, episodes };
  }

  async watch(url) {
    const domainMatch = url.match(/^(https?:\/\/[^\/]+)/);
    const domain = domainMatch ? domainMatch[1] : this.baseUrl;
    let res;
    try {
      res = await this.request(url.replace(domain, ""), { headers: this.headers(domain) });
    } catch (e) {
      return { type: "hls", url: "" };
    }

    const m = res.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
    if (m) {
      try {
        const data = JSON.parse(m[1]);
        if (data.url) return { type: "hls", url: data.url };
      } catch (e) {}
    }

    const m3u8Match = res.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (m3u8Match) return { type: "hls", url: m3u8Match[1] };

    return { type: "hls", url: "" };
  }
}