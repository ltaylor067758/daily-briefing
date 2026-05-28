// ===== RSS 源配置 =====
// 选择原则：1) RSS 可被抓取 2) 原文链接国内能打开（至少不被 GFW 阻断）
// BBC/Google News/纽约时报等在国内无法访问，已剔除
// 脚本内置超时保护，单源超时不影响其他源

export const RSS_SOURCES = [
  // --- 国内新闻（中文，链接国内可访问） ---
  { name: '36氪', url: 'https://36kr.com/feed', category: 'domestic', lang: 'zh' },
  { name: 'IT之家', url: 'https://www.ithome.com/rss/', category: 'domestic', lang: 'zh' },

  // --- 国际新闻（英文，DSV4 翻译为中文） ---
  // 注意：这些源在 GitHub Actions 上可以抓取，但原文链接在国内可能无法访问
  { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/worldNews', category: 'international', lang: 'en' },
  { name: 'AP News', url: 'https://feeds.apnews.com/apnews/topnews', category: 'international', lang: 'en' },

  // --- AI 与科技（中文+英文混合） ---
  { name: '量子位', url: 'https://www.qbitai.com/feed', category: 'ai', lang: 'zh' },
  { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', category: 'ai', lang: 'zh' },
  { name: '少数派', url: 'https://sspai.com/feed', category: 'ai', lang: 'zh' },
  { name: '爱范儿', url: 'https://www.ifanr.com/feed', category: 'ai', lang: 'zh' },
];

// ===== AI Prompt 配置 =====

export const SUMMARIZE_SYSTEM_PROMPT = `你是一位资深的中文新闻编辑。请从以下当天抓取的新闻列表中，筛选并生成今日简报。

## 最重要限制：时效性
- **严格只选择过去24小时内发布的新闻**，跳过任何发布时间超过24小时的内容
- 时效性是最高优先级筛选标准，宁可少选也不要选旧闻
- 检查每条新闻的发布时间，确保是今天的新闻

## 任务
1. 筛选最重要的 5-8 条时事新闻（国内+国际各半）和 3-5 条 AI/科技新闻
2. 每条新闻用 **1 句话**（不超过 40 字）概括核心内容，中文输出
3. 英文新闻翻译为流畅中文
4. **必须保留原文链接，格式为 [阅读原文](完整URL)**
5. 在简报末尾生成一条"今日金句"

## 链接质量要求
- 只保留国内可以正常访问的链接（36氪、IT之家、量子位、少数派、爱范儿等）
- 国际新闻源（Reuters、AP）的链接，如果链接可能无法访问，优先使用国内转载源的链接
- 确保链接URL完整有效，不是重定向/跳转链接

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

## 格式强调
- 标题必须用 **[标题]** 格式（方括号+加粗），不要用 **标题**（只有加粗没有方括号）
- 摘要和链接之间用 ...[阅读原文](URL) 连接（三个英文句点）

---

> **今日金句**：...

## 输出规则
- 每个条目独占一行，不要换行
- 链接格式必须是 [阅读原文](完整URL)
- 摘要控制在40字以内
- 跳过八卦、广告、软文、内容农场`;

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
  maxAgeHours: 24,        // 只保留最近 24 小时内的新闻
  maxItemsPerCategory: {
    domestic: 15,
    international: 15,
    ai: 10,
  },
  dedupeThreshold: 0.6,
  minContentLength: 15,
};
