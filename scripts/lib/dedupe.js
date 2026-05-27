/**
 * 基于 Jaccard 相似度的标题去重
 * 将标题拆为 2-gram 字符组，计算 Jaccard 系数
 */

function bigram(str) {
  const chars = str.replace(/\s+/g, '');
  const grams = [];
  for (let i = 0; i < chars.length - 1; i++) {
    grams.push(chars.substring(i, i + 2));
  }
  return new Set(grams);
}

export function jaccardSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a.length < 8 || b.length < 8) return 0; // 太短不比较
  const setA = bigram(a);
  const setB = bigram(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const gram of setA) {
    if (setB.has(gram)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function dedupeArticles(articles, threshold = 0.6) {
  const kept = [];
  for (const article of articles) {
    const isDuplicate = kept.some(k => {
      const sim = jaccardSimilarity(k.title, article.title);
      return sim >= threshold;
    });
    if (!isDuplicate) {
      kept.push(article);
    }
  }
  return kept;
}

/**
 * 按类别限制数量
 */
export function limitByCategory(articles, limits) {
  const counts = {};
  const result = [];
  for (const article of articles) {
    const cat = article.category || 'other';
    counts[cat] = (counts[cat] || 0) + 1;
    const limit = limits[cat] ?? Infinity;
    if (counts[cat] <= limit) {
      result.push(article);
    }
  }
  return result;
}
