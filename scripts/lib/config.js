// ===== RSS 源配置 =====
// 选择原则：1) RSS 可被抓取 2) 原文链接国内能打开（至少不被 GFW 阻断）
// BBC/Google News/纽约时报等在国内无法访问，已剔除
// 脚本内置超时保护，单源超时不影响其他源

export const RSS_SOURCES = [
  // --- 国内新闻（中文，链接国内可访问） ---
  { name: '36氪', url: 'https://36kr.com/feed', category: 'domestic', lang: 'zh' },
  { name: 'IT之家', url: 'https://www.ithome.com/rss/', category: 'domestic', lang: 'zh' },
  { name: '虎嗅', url: 'https://www.huxiu.com/rss/0.xml', category: 'domestic', lang: 'zh' },

  // --- 国际新闻（英文，DSV4 翻译为中文） ---
  { name: 'Reuters', url: 'https://feeds.reuters.com/reuters/worldNews', category: 'international', lang: 'en' },
  { name: 'AP News', url: 'https://feeds.apnews.com/apnews/topnews', category: 'international', lang: 'en' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', category: 'international', lang: 'en' },
  { name: 'NPR World', url: 'https://feeds.npr.org/1004/rss.xml', category: 'international', lang: 'en' },

  // --- AI 与科技（中文） ---
  { name: '量子位', url: 'https://www.qbitai.com/feed', category: 'ai', lang: 'zh' },
  { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', category: 'ai', lang: 'zh' },
  { name: '少数派', url: 'https://sspai.com/feed', category: 'ai', lang: 'zh' },
  { name: '爱范儿', url: 'https://www.ifanr.com/feed', category: 'ai', lang: 'zh' },
];

// ===== AI Prompt 配置 =====

export const SUMMARIZE_SYSTEM_PROMPT = `你是一位资深的中文新闻编辑。请从以下当天抓取的新闻列表中，筛选并生成今日简报。

## 最重要限制：时效性 + 权威性
- **严格只选择过去24小时内发布的新闻**
- **只选真正有公共价值的新闻**，跳过以下内容：
  - 产品发布会/新车上市/手机发布等软文（如：问界M9上市、蔚来ES9发布）
  - 公司融资/上市/股价波动等纯商业消息
  - 八卦、娱乐、广告、内容农场
  - 只影响极少数人的小众话题
- 优先选择：政策变动、国际冲突、科技突破、社会热点、经济大势

## 任务
1. **国内要闻：必须选 5 条**最重要的国内新闻
2. **国际要闻：必须选 5 条**最重要的国际新闻
3. **AI 与科技：必须选 5 条**最重要的 AI/科技新闻
4. 每条新闻用 **1 句话**（不超过 40 字）概括核心内容，中文输出
5. 英文新闻翻译为流畅中文
6. **必须保留原文链接，格式为 [阅读原文](完整URL)**
7. 在简报末尾生成一条"今日金句"
8. **每条新闻必须添加一行 HTML 注释格式的讨论角度**：\`${'<!--'} discuss: 独到见解 ${'-->'}\`
   - 这个讨论角度将被播客用于深入讨论，**必须提供摘要中没有的额外信息、背景或独特视角**
   - 不要复述摘要，要给听众新的认知增量
   - 控制在 25-40 字
   - 例如：\`${'<!--'} discuss: 这意味着AI监管从原则指导转向落地执行，创业公司合规成本将显著上升 ${'-->'}\`

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
${'<!--'} discuss: 对该新闻的独到见解 ${'-->'}
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

// ===== 播客对话 Prompt =====

export const DIALOGUE_SYSTEM_PROMPT = `你是一位资深播客主持人，专门制作"每日简报"新闻对话节目。你的搭档是一男一女两位主持人：云希（男）和小晓（女）。

## 你的任务
根据当天的新闻简报内容，生成一段 5-8 分钟的男女对话播客脚本。

## 风格要求
- **自然对话，不要念稿**：像两个朋友聊天一样讨论新闻，有互动、有追问、有感叹
- **聚焦 3-5 个热点**：挑选最有讨论价值的新闻深入展开，不要每条都念
- **有人味儿**：加入适当的个人观点、背景补充、情感反应（惊讶、担忧、期待等）
- **语言口语化**：说"咱们来看看"而不是"据悉"，说"这事儿挺大"而不是"此事具有重要意义"
- **男女互动**：女主持提问/引导，男主持分析/补充，或者反过来，不要轮流念新闻

## 输出格式
每行一个发言，格式为"男：xxx"或"女：xxx"，例如：

男：各位好，今天是X月X日，欢迎收听每日简报。我是云希。
女：我是小晓。今天有好几个重磅消息，咱们一个个聊。
男：先说国内方面，今天最值得关注的是...
女：没错，这件事影响确实很大。具体来说呢...
（继续对话...）
男：好，以上就是今天的全部内容。感谢收听。
女：明天见！

## 注意
- 不要在对话中读链接URL
- 不要使用 Markdown 格式（如 ** 加粗）
- 不要用序号列表
- 每句话控制在 15-50 字，方便语音合成
- 总长度控制在 40-60 句`;

// ===== TTS 配置 =====

export const TTS_CONFIG = {
  // YunxiNeural: 年轻男声，支持 chat/cheerful 等 SSML 风格
  // XiaoxiaoNeural: 温暖女声，SSML 风格支持最全
  maleVoice: 'zh-CN-YunxiNeural',
  femaleVoice: 'zh-CN-XiaoxiaoNeural',
  rate: '-5%',
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
