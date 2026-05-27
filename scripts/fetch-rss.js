import Parser from 'rss-parser';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { RSS_SOURCES, FETCH_CONFIG } from './lib/config.js';
import { dedupeArticles, limitByCategory } from './lib/dedupe.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const OUTPUT_FILE = join(DATA_DIR, 'raw-news.json');

const parser = new Parser({
  timeout: FETCH_CONFIG.timeout,
  headers: {
    'User-Agent': 'DailyBriefing/1.0 (RSS Reader)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
});

function extractDate(item, sourceName) {
  const candidates = [
    item.pubDate,
    item.published,
    item.isoDate,
    item.date,
    item.lastBuildDate,
    item.updated,
  ];
  for (const c of candidates) {
    if (c) {
      try {
        const d = new Date(c);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch { /* continue */ }
    }
  }
  return new Date().toISOString();
}

function cleanContent(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')          // 去掉 HTML 标签
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function withTimeout(promise, ms, name) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function fetchOne(source) {
  try {
    console.log(`  [${source.name}] 抓取中...`);
    const feed = await withTimeout(parser.parseURL(source.url), 12000, source.name);

    if (!feed || !feed.items || feed.items.length === 0) {
      console.log(`  [${source.name}] 无内容`);
      return [];
    }

    const articles = feed.items
      .map(item => ({
        title: (item.title || '').trim(),
        summary: cleanContent(item.contentSnippet || item.content || item.summary || ''),
        url: item.link || '',
        pubDate: extractDate(item, source.name),
        sourceName: source.name,
        category: source.category,
        lang: source.lang,
      }))
      .filter(a => a.title.length > 0 && a.summary.length >= FETCH_CONFIG.minContentLength);

    console.log(`  [${source.name}] ✓ ${articles.length} 条`);
    return articles;
  } catch (err) {
    console.error(`  [${source.name}] ✗ 失败: ${err.message}`);
    return [];
  }
}

async function main() {
  console.log('=== 每日简报 RSS 抓取 ===');
  console.log(`时间: ${new Date().toISOString()}`);
  console.log(`共 ${RSS_SOURCES.length} 个源\n`);

  // Step 1: 并发抓取所有源（全局 90 秒超时保护）
  const results = await withTimeout(
    Promise.all(RSS_SOURCES.map(source => fetchOne(source))),
    90000,
    'Global fetch'
  );

  let allArticles = results.flat();

  console.log(`\n抓取总计: ${allArticles.length} 条`);

  // Step 2: 按类别统计
  const byCategory = {};
  for (const a of allArticles) {
    byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  }
  console.log('按类别:', JSON.stringify(byCategory));

  // Step 3: 去重
  const deduped = dedupeArticles(allArticles, FETCH_CONFIG.dedupeThreshold);
  console.log(`去重后: ${deduped.length} 条 (删除 ${allArticles.length - deduped.length} 条重复)`);

  // Step 4: 按类别限数
  const limited = limitByCategory(deduped, FETCH_CONFIG.maxItemsPerCategory);
  console.log(`限数后: ${limited.length} 条`);

  // Step 5: 按日期倒序排列
  limited.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Step 6: 输出 JSON
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    total: limited.length,
    byCategory,
    articles: limited,
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✓ 已写入 ${OUTPUT_FILE}`);
  console.log('=== 抓取完成 ===');
}

main().catch(err => {
  console.error('抓取出错:', err);
  process.exit(1);
});
