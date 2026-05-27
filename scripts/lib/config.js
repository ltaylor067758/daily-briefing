// ===== RSS 源配置 =====
// 注意：部分国际源（Reuters/BBC/AP/Al Jazeera/The Guardian）在本地可能因网络原因超时，
// 但在 GitHub Actions (美国服务器) 上正常运行。

export const RSS_SOURCES = [
  // --- 国内新闻（中文） ---
  { name: 'Google News 中国', url: 'https://news.google.com/rss?hl=zh-CN&gl=CN&ceid=CN:zh-Hans', category: 'domestic', lang: 'zh' },
  { name: 'BBC 中文', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', category: 'domestic', lang: 'zh' },
  { name: '纽约时报中文', url: 'https://cn.nytimes.com/rss/', category: 'domestic', lang: 'zh' },
  { name: '36氪', url: 'https://36kr.com/feed', category: 'domestic', lang: 'zh' },

  // --- 国际新闻（英文，DSV4 翻译为中文） ---
  { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/worldNews', category: 'international', lang: 'en' },
  { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', category: 'international', lang: 'en' },
  { name: 'AP News', url: 'https://feeds.apnews.com/apnews/topnews', category: 'international', lang: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'international', lang: 'en' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/world/rss', category: 'international', lang: 'en' },

  // --- AI 与科技（中文+英文混合） ---
  { name: '量子位', url: 'https://www.qbitai.com/feed', category: 'ai', lang: 'zh' },
  { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', category: 'ai', lang: 'zh' },
  { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'ai', lang: 'en' },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/tag/artificial-intelligence/feed/', category: 'ai', lang: 'en' },
];

// ===== AI Prompt 配置 =====

export const SUMMARIZE_SYSTEM_PROMPT = `你是一位资深的中文新闻编辑，负责从当天抓取的新闻中筛选并生成每日简报。

## 你的任务
1. 从提供的新闻列表中，筛选最重要的 5-10 条时事新闻（国内+国际各半）和 3-5 条 AI/科技新闻
2. 每条新闻用 1-2 句话概括核心内容，中文输出
3. 英文新闻需翻译为流畅的中文
4. 保留原文链接
5. 在简报末尾生成一条"今日金句"（可以是新闻中提炼的有洞察力的观点）

## 输出格式（严格按此 Markdown 结构）
---
date: YYYY-MM-DD
title: 每日简报 YYYY年M月D日
---

# 每日简报 · YYYY年M月D日

## 🇨🇳 国内要闻

1. **[新闻标题]** — 摘要内容，简明扼要...[阅读原文](URL)
2. ...

## 🌍 国际要闻

1. **[新闻标题]** — 摘要内容，简明扼要...[阅读原文](URL)

## 🤖 AI 与科技

1. **[新闻标题]** — 摘要内容，简明扼要...[阅读原文](URL)

---

> **今日金句**：...

## 注意事项
- 优先选择有实质内容、读者会关心的新闻，跳过琐碎八卦
- 标题要抓住核心，不要翻译腔
- 国内/国际新闻控制在 5-10 条，AI 新闻 3-5 条
- 简报整体要有"一读就懂今天发生什么"的感觉`;

// ===== TTS 配置 =====

export const TTS_CONFIG = {
  maleVoice: 'zh-CN-YunxiNeural',    // 男声
  femaleVoice: 'zh-CN-XiaoxiaoNeural', // 女声
  rate: '+10%',   // 语速稍快
  outputDir: 'public/audio',
};

// ===== 抓取配置 =====

export const FETCH_CONFIG = {
  timeout: 15000,         // 单源超时 ms
  maxItemsPerCategory: {
    domestic: 15,         // 抓取时不过度限制，留给 AI 筛选
    international: 15,
    ai: 10,
  },
  dedupeThreshold: 0.6,  // 标题相似度阈值 (Jaccard)
  minContentLength: 15,  // 最短摘要字符数
};
