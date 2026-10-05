// ==MiruExtension==
// @name         搬山人小说网
// @version      v1.0.7
// @author       Miru
// @lang         zh-cn
// @icon         https://www.banshanren.com/favicon.ico
// @license      MIT
// @package      banshanren
// @type         fikushon
// @webSite      https://www.banshanren.com
// ==/MiruExtension==

const BASE = "https://www.banshanren.com";
const UA = "Mozilla/5.0 (Linux; Android 11; M2007J3SC) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/77.0.3865.120 Mobile Safari/537.36";

export default class extends Extension {
  headers = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": BASE + "/",
  };

  async getHtml(path) {
    return await this.request(path, { headers: this.headers });
  }

  toPath(url) {
    if (!url) return url;
    return url.replace(/^https?:\/\/[^\/]+/i, "");
  }

  absUrl(url) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (url.charAt(0) === "/") return BASE + url;
    return BASE + "/" + url;
  }

  // ==================== 最新列表 ====================
  async latest(page) {
    const html = await this.getHtml("/all/0-0-0-0-0-0-1-" + page + "/");
    return await this.parseList(html);
  }

  // ==================== 搜索 ====================
  async search(kw, page) {
    const keyword = (kw || "").trim();
    let html;
    if (keyword.length === 0) {
      html = await this.getHtml("/all/0-0-0-0-0-0-1-" + page + "/");
    } else {
      html = await this.getHtml(
        "/search/index?keyword=" + encodeURIComponent(keyword) + "&page=" + page
      );
    }
    return await this.parseList(html);
  }

  // ==================== 列表页解析 ====================
  async parseList(html) {
    const items = [];
    const nodes = await this.querySelectorAll(html, "li.novel_li");
    for (let i = 0; i < nodes.length; i++) {
      const c = await nodes[i].content;
      const a = await this.querySelector(c, "a.title");
      if (!a) continue;

      const titleText = await a.text;
      const href = await this.getAttributeText(c, "a.title", "href");
      const cover = await this.getAttributeText(c, "img.encrypted-image", "data-src");

      items.push({
        title: (titleText || "").trim(),
        url: href,
        cover: this.absUrl(cover),
      });
    }
    return items;
  }

  // ==================== 详情页 ====================
  async detail(url) {
    let path = this.toPath(url).replace(/\/+$/, "");
    const html = await this.getHtml(path);

    const h1 = await this.querySelector(html, "h1");
    const titleText = h1 ? await h1.text : "";
    const title = (titleText || "").trim();

    const coverAttr = await this.getAttributeText(
      html, 'meta[property="og:image"]', "content"
    );
    const cover = this.absUrl(coverAttr);

    const descAttr = await this.getAttributeText(
      html, 'meta[property="og:description"]', "content"
    );
    const desc = (descAttr || "").trim();

    // ---- 章节列表：多级回退 ----
    let links = [];
    const selectors = [
      'a[href^="/novel/"]',
      'ul.chapter_list a',
      'li.volume_chapter a',
      'div.volume_box a',
      'a',
    ];
    for (let s = 0; s < selectors.length; s++) {
      try {
        links = await this.querySelectorAll(html, selectors[s]);
      } catch (e) {
        links = [];
      }
      if (links && links.length > 0) break;
    }

    const seen = {};
    const episodes = [];
    for (let i = 0; i < links.length; i++) {
      let c = "";
      try {
        c = await links[i].content;
      } catch (e) {
        continue;
      }
      let href = "";
      try {
        href = await this.getAttributeText(c, "a", "href");
      } catch (e) {
        continue;
      }
      if (!href) continue;

      // 只保留章节链接：/novel/{slug}/{chapterId}
      if (!/^\/novel\/[^\/]+\/[^\/]+$/.test(href)) continue;
      if (seen[href]) continue;
      seen[href] = true;

      let name = "";
      try {
        name = (await links[i].text || "").trim();
      } catch (e) {
        name = "";
      }
      if (!name) continue;

      episodes.push({ name: name, url: href });
    }

    return {
      title: title,
      cover: cover,
      desc: desc,
      episodes: [{ title: "目录", urls: episodes }],
    };
  }

  // ==================== 正文 ====================
  async watch(url) {
    const path = this.toPath(url);
    const html = await this.getHtml(path);

    // 标题
    const h2 = await this.querySelector(html, "h2");
    const rawTitle = h2 ? await h2.text : "";
    const title = (rawTitle || "")
      .trim()
      .replace(/^第[一二三四五六七八九十百千]+卷\s*/, "");

    // ---- 分层抓取正文段落 ----
    let paras = [];

    // 第 1 层：先拿到正文容器，再在容器里查 p
    try {
      const box = await this.querySelector(html, "div.chapter_content_box");
      if (box) {
        const boxContent = await box.content;
        paras = await this.querySelectorAll(boxContent, "p");
      }
    } catch (e) {
      paras = [];
    }

    // 第 2 层：容器没找到，全页面查 p 兜底
    if (!paras || paras.length === 0) {
      try {
        paras = await this.querySelectorAll(html, "p");
      } catch (e) {
        paras = [];
      }
    }

    // ---- 逐段取文本 ----
    const content = [];
    for (let i = 0; i < paras.length; i++) {
      let text = "";

      // 优先用 .text
      try {
        text = await paras[i].text;
      } catch (e) {
        text = "";
      }
      text = (text || "").trim();

      // .text 为空则退而求其次：取 .content 手动剥标签
      if (!text) {
        try {
          let raw = await paras[i].content;
          raw = (raw || "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/&nbsp;/gi, " ")
            .replace(/<[^>]+>/g, "");
          text = raw.trim();
        } catch (e) {
          text = "";
        }
      }

      // 去掉末尾的句评数字（<span class="z count_N">0</span> 残留）
      text = text.replace(/\s*\d+\s*$/, "").trim();

      if (text.length > 0) {
        content.push(text);
      }
    }

    return { title: title, content: content };
  }
}