import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SUMMARIZE_SYSTEM_PROMPT } from './lib/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const CONTENT_DIR = join(__dirname, '..', 'src', 'content', 'briefings');
const INPUT_FILE = join(DATA_DIR, 'raw-news.json');

// DSV4 配置
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
});

const MODEL = process.env.ANTHROPIC_MODEL || 'deepseek-v4-pro';

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTodayChinese() {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatArticlesForPrompt(articles) {
  return articles
    .map((a, i) =>
      `[${i + 1}] **[${a.sourceName}]** ${a.title}\n   摘要: ${a.summary.substring(0, 400)}\n   链接: ${a.url}\n   类别: ${a.category}`
    )
    .join('\n\n');
}

async function callAI(articles) {
  const articlesText = formatArticlesForPrompt(articles);
  const todayDate = getTodayDate();
  const todayChinese = getTodayChinese();
  const userPrompt = `今天是 ${todayDate}（${todayChinese}）。以下是今天抓取的新闻列表。请严格按照系统指令中的要求，筛选并生成今日简报。

${articlesText}

请严格按系统指令中的 Markdown 格式输出今日简报。注意：标题和date字段必须使用 ${todayDate} 和 ${todayChinese}。`;

  console.log(`发送 ${articles.length} 条新闻给 AI...`);
  console.log(`Prompt 长度: ${userPrompt.length} 字符`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: SUMMARIZE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
    temperature: 0.7,
  });

  const content = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  console.log(`AI 响应长度: ${content.length} 字符`);
  console.log(`Token 用量: input=${response.usage?.input_tokens}, output=${response.usage?.output_tokens}`);

  return content;
}

async function main() {
  console.log('=== AI 摘要生成 ===');

  // 读取原始新闻
  if (!existsSync(INPUT_FILE)) {
    console.error('找不到 raw-news.json，请先运行 fetch-rss.js');
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`读取 ${raw.total} 条新闻`);

  if (raw.articles.length === 0) {
    console.error('没有新闻数据');
    process.exit(1);
  }

  // 调用 AI
  let markdown;
  try {
    markdown = await callAI(raw.articles);
  } catch (err) {
    console.error('AI 调用失败:', err.message);
    // 降级：生成简易版简报
    console.log('降级：生成简易简报...');
    markdown = generateFallbackBriefing(raw.articles);
  }

  // 强制修正日期：无论AI输出什么日期，都覆盖为今天的正确日期
  const dateStr = getTodayDate();
  const dateChinese = getTodayChinese();
  markdown = markdown
    // 1. 强制覆盖 frontmatter 中的 date 字段
    .replace(/^date:\s*.+$/m, `date: "${dateStr}"`)
    // 2. YYYY-MM-DD 占位符兜底
    .replace(/YYYY-MM-DD/g, dateStr)
    // 3. 标题中的任何中文日期格式，统一替换为今天
    .replace(/\d{4}年\d{1,2}月\d{1,2}日/g, dateChinese)
    // 4. YYYY年M月D日 占位符兜底
    .replace(/YYYY年M月D日/g, dateChinese);

  // 确保输出目录存在
  if (!existsSync(CONTENT_DIR)) {
    mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const outputFile = join(CONTENT_DIR, `${dateStr}.md`);
  writeFileSync(outputFile, markdown, 'utf-8');
  console.log(`\n✓ 已写入 ${outputFile}`);
  console.log('=== 摘要完成 ===');
}

function generateFallbackBriefing(articles) {
  const byCategory = {};
  for (const a of articles) {
    (byCategory[a.category] = byCategory[a.category] || []).push(a);
  }

  const sections = [
    { key: 'domestic', label: '🇨🇳 国内要闻' },
    { key: 'international', label: '🌍 国际要闻' },
    { key: 'ai', label: '🤖 AI 与科技' },
  ];

  const todayDate = getTodayDate();
  const todayChinese = getTodayChinese();
  let md = `---
date: "${todayDate}"
title: 每日简报 ${todayChinese}
---

# 每日简报 · ${todayChinese}

`;

  for (const { key, label } of sections) {
    const items = byCategory[key] || [];
    if (items.length === 0) continue;
    md += `## ${label}\n\n`;
    const top = items.slice(0, 8);
    for (const item of top) {
      const shortSummary = item.summary.substring(0, 150).replace(/\n/g, ' ');
      md += `1. **[${item.title}]** — ${shortSummary}...[阅读原文](${item.url})\n`;
    }
    md += '\n';
  }

  md += '---\n\n> **今日金句**：今日新闻由自动降级模式生成，金句暂缺。\n';
  return md;
}

main().catch(err => {
  console.error('摘要出错:', err);
  process.exit(1);
});
