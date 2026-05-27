// ===== RSS 源配置 =====
// 注意：部分国际源在执行环境中可能超时（网络限制），
// 脚本内置超时保护，单源超时不影响其他源。

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

export const SUMMARIZE_SYSTEM_PROMPT = `你是一位资深的中文新闻编辑。请从以下当天抓取的新闻列表中，筛选并生成今日简报。

## 重要限制
- **只选择今天（24小时内）发布的新闻**，跳过任何发布时间超过24小时的内容
- 时效性是第一优先级的筛选标准

## 任务
1. 筛选最重要的 5-8 条时事新闻（国内+国际各半）和 3-5 条 AI/科技新闻
2. 每条新闻用 **1 句话**（不超过 40 字）概括核心内容，中文输出
3. 英文新闻翻译为流畅中文
4. **必须保留原文链接**
5. 在简报末尾生成一条"今日金句"

## 输出格式（严格按照此 Markdown 结构）
---
date: YYYY-MM-DD
title: 每日简报 YYYY年M月D日
---

# 每日简报 · YYYY年M月D日

## 🇨🇳 国内要闻

1. **[标题]** — 一句话摘要...[阅读原文](URL)
2. ...

## 🌍 国际要闻

1. **[标题]** — 一句话摘要...[阅读原文](URL)

## 🤖 AI 与科技

1. **[标题]** — 一句话摘要...[阅读原文](URL)

---

> **今日金句**：...

## 输出规则
- 每个条目独占一行，不要换行
- 链接格式必须是 [阅读原文](完整URL)
- 摘要控制在40字以内
- 跳过八卦、广告、软文`;

// ===== TTS 配置 =====

export const TTS_CONFIG = {
  maleVoice: 'zh-CN-YunxiNeural',
  femaleVoice: 'zh-CN-XiaoxiaoNeural',
  rate: '+10%',
  outputDir: 'public/audio',
};

// ===== 抓取配置 =====

export const FETCH_CONFIG = {
  timeout: 12000,         // 单源超时 ms
  maxAgeHours: 36,        // 只保留最近 N 小时内的新闻
  maxItemsPerCategory: {
    domestic: 15,
    international: 15,
    ai: 10,
  },
  dedupeThreshold: 0.6,
  minContentLength: 15,
};
