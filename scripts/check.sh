#!/usr/bin/env bash
# check.sh — 每日简报流水线自检
# 用法: bash scripts/check.sh [--strict] [--audio]
#   --strict  警告也导致失败
#   --audio   检查音频（需要 ffprobe）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

# 切换到项目根目录，后续所有相对路径基于此
cd "$ROOT"

TODAY="$(date +%Y-%m-%d)"
TODAY_CN="$(date +%Y年%-m月%-d日)"
STRICT=false
CHECK_AUDIO=false

for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=true ;;
    --audio) CHECK_AUDIO=true ;;
  esac
done

PASS=0; FAIL=0; WARN=0
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARN=$((WARN + 1)); }

# 辅助：读 JSON 字段（从 data/raw-news.json）
json() {
  node -e "try{const d=JSON.parse(require('fs').readFileSync('data/raw-news.json','utf8')); process.stdout.write(String($1))}catch(e){process.stdout.write('0')}" 2>/dev/null || echo "0"
}

echo "========================================"
echo " 每日简报流水线自检"
echo " 日期: $TODAY ($TODAY_CN)"
echo " 时间: $(date +%H:%M:%S)"
echo "========================================"

# ── 第一步：RSS 抓取 ──
echo ""
echo "【1/4】RSS 抓取检查"

if [ ! -f "data/raw-news.json" ]; then
  fail "raw-news.json 不存在 — 请先运行 npm run fetch"
  echo ""
  echo "========================================"
  echo " 结果: 中断（缺少上游数据）"
  echo "========================================"
  exit 1
fi
pass "raw-news.json 存在"

TOTAL=$(json 'd.total||0')
if [ "$TOTAL" -ge 6 ]; then
  pass "新闻总数: $TOTAL (≥6)"
elif [ "$TOTAL" -gt 0 ]; then
  warn "新闻总数: $TOTAL (不足6条，站点仍可构建)"
else
  fail "新闻总数: 0"
fi

for cat in domestic international ai; do
  COUNT=$(json "(d.byCategory&&d.byCategory['$cat'])||0")
  if [ "$COUNT" -ge 2 ]; then
    pass "${cat} 版块: $COUNT 条 (≥2)"
  elif [ "$COUNT" -gt 0 ]; then
    warn "${cat} 版块: $COUNT 条 (不足2条)"
  else
    fail "${cat} 版块: 0 条"
  fi
done

# 时效性检查
OLD_COUNT=$(node -e "
try{
  const d=JSON.parse(require('fs').readFileSync('data/raw-news.json','utf8'));
  const now=Date.now();
  const old=d.articles.filter(a=>now-new Date(a.pubDate)>36*60*60*1000);
  process.stdout.write(String(old.length));
}catch(e){process.stdout.write('0')}
" 2>/dev/null || echo "0")
if [ "$OLD_COUNT" -eq 0 ]; then
  pass "时效性: 所有新闻在36h内"
else
  warn "时效性: $OLD_COUNT 条超过36h"
fi

# 空字段检查
BAD_COUNT=$(node -e "
try{
  const d=JSON.parse(require('fs').readFileSync('data/raw-news.json','utf8'));
  const bad=d.articles.filter(a=>!a.title||a.title.length<2||!a.summary||a.summary.length<15);
  process.stdout.write(String(bad.length));
}catch(e){process.stdout.write('0')}
" 2>/dev/null || echo "0")
if [ "$BAD_COUNT" -eq 0 ]; then
  pass "字段完整性: 无空标题/摘要"
else
  fail "字段完整性: $BAD_COUNT 条有空标题或摘要过短"
fi

# ── 第二步：AI 摘要 ──
echo ""
echo "【2/4】AI 摘要检查"

BF_FILE="src/content/briefings/${TODAY}.md"
if [ ! -f "$BF_FILE" ]; then
  fail "${TODAY}.md 不存在 — 请先运行 npm run summarize"
else
  pass "${TODAY}.md 存在"

  # 日期正确
  DATE_IN_MD=$(grep -oP '^date:\s*"\K[^"]+' "$BF_FILE" 2>/dev/null || echo "")
  if [ "$DATE_IN_MD" = "$TODAY" ]; then
    pass "frontmatter date = $TODAY"
  else
    fail "frontmatter date 错误: $DATE_IN_MD (期望 $TODAY)"
  fi

  # 三版块 (不用 emoji 匹配，bash 多字节序列不兼容)
  for kw in "国内要闻" "国际要闻" "AI 与科技"; do
    if grep -q "## .*${kw}" "$BF_FILE" 2>/dev/null; then
      pass "版块存在: $kw"
    else
      fail "版块缺失: $kw"
    fi
  done

  # 每版块条目数
  for section in "国内要闻" "国际要闻" "AI 与科技"; do
    SEC_COUNT=$(awk "/## .*${section}/{found=1; next} /^## /{found=0} found && /^[0-9]+\./" "$BF_FILE" | wc -l)
    if [ "$SEC_COUNT" -ge 3 ]; then
      pass "${section}: $SEC_COUNT 条 (≥3)"
    elif [ "$SEC_COUNT" -gt 0 ]; then
      warn "${section}: $SEC_COUNT 条 (不足3条)"
    else
      fail "${section}: 0 条"
    fi
  done

  # 链接检查
  LINK_COUNT=$(grep -c '\[阅读原文\](http' "$BF_FILE" 2>/dev/null || echo "0")
  TOTAL_ITEMS=$(grep -c '^[0-9]\+\. \*\*' "$BF_FILE" 2>/dev/null || echo "0")
  if [ "$LINK_COUNT" -ge "$TOTAL_ITEMS" ] 2>/dev/null && [ "$TOTAL_ITEMS" -gt 0 ]; then
    pass "链接完整: $LINK_COUNT/$TOTAL_ITEMS 条有链接"
  elif [ "$LINK_COUNT" -gt 0 ]; then
    warn "链接不全: $LINK_COUNT/$TOTAL_ITEMS 条有链接"
  else
    fail "链接缺失: 0 条有链接"
  fi

  # 中文占比 (用 Node.js 检测)
  CN_RATIO=$(node -e "
try{
  const fs=require('fs');
  let text=fs.readFileSync('$BF_FILE','utf8');
  let lines=text.split('\n');
  let body=lines.filter(l=>!l.startsWith('---')&&!l.startsWith('date:')&&!l.startsWith('title:')).join('');
  if(!body) body=text;
  let cn=0,total=0;
  for(let c of body){
    let code=c.codePointAt(0);
    // CJK Unified (U+4E00-U+9FFF), CJK Extension A (U+3400-U+4DBF), CJK Compat (U+F900-U+FAFF)
    // Fullwidth Forms (U+FF00-U+FFEF), CJK Symbols (U+3000-U+303F)
    let isCJK=(code>=0x4E00&&code<=0x9FFF)||(code>=0x3400&&code<=0x4DBF)||(code>=0xF900&&code<=0xFAFF)||(code>=0xFF00&&code<=0xFFEF)||(code>=0x3000&&code<=0x303F);
    if(isCJK) cn++;
    if(c.match(/^[\p{L}\p{N}]$/u)||isCJK) total++;
  }
  let ratio=total>0?(cn/total*100):0;
  process.stdout.write(ratio.toFixed(1));
}catch(e){process.stdout.write('0')}
" 2>/dev/null || echo "0")
  CN_RATIO_NUM=$(echo "$CN_RATIO" | grep -oP '[\d.]+' || echo "0")
  # 使用 Node 做浮点比较 (bc 在 Windows git-bash 不可用)
  CN_LEVEL=$(node -e "process.stdout.write(Number($CN_RATIO_NUM)>50?'ok':Number($CN_RATIO_NUM)>30?'warn':'fail')" 2>/dev/null || echo "fail")
  if [ "$CN_LEVEL" = "ok" ]; then
    pass "中文占比: ${CN_RATIO}% (≥50%，含URL正常)"
  elif [ "$CN_LEVEL" = "warn" ]; then
    warn "中文占比: ${CN_RATIO}% (偏低，可能含英文残留)"
  else
    fail "中文占比: ${CN_RATIO}% (严重偏低)"
  fi

  # 今日金句
  if grep -q '> \*\*今日金句' "$BF_FILE" 2>/dev/null; then
    pass "今日金句存在"
  else
    warn "今日金句缺失"
  fi

  # 讨论角度 (discuss comments)
  DISCUSS_COUNT=$(grep -c '<!-- discuss:' "$BF_FILE" 2>/dev/null || echo "0")
  if [ "$DISCUSS_COUNT" -ge 5 ]; then
    pass "讨论角度: $DISCUSS_COUNT 条 (≥5)"
  elif [ "$DISCUSS_COUNT" -gt 0 ]; then
    warn "讨论角度: $DISCUSS_COUNT 条 (不足5条)"
  else
    warn "讨论角度: 0 条 (播客对话会缺深度)"
  fi
fi

# ── 第三步：音频 ──
echo ""
echo "【3/4】音频检查"

AUDIO_FILE="public/audio/${TODAY}.mp3"
DIALOGUE_FILE="public/scripts/${TODAY}-dialogue.txt"

if [ "$CHECK_AUDIO" = true ]; then
  if [ ! -f "$AUDIO_FILE" ]; then
    warn "音频文件不存在 — 请运行 npm run audio (或环境缺少 edge-tts)"
  else
    pass "音频文件存在"

    # 文件大小
    SIZE=$(stat -c%s "$AUDIO_FILE" 2>/dev/null || stat -f%z "$AUDIO_FILE" 2>/dev/null || echo "0")
    if [ "$SIZE" -gt 512000 ]; then
      KB=$((SIZE / 1024))
      pass "文件大小: ${KB}KB (>500KB)"
    elif [ "$SIZE" -gt 0 ]; then
      warn "文件大小: $((SIZE / 1024))KB (偏小，可能不完整)"
    else
      fail "文件大小: 0"
    fi

    # 时长 (需要 ffprobe)
    if command -v ffprobe &>/dev/null; then
      DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$AUDIO_FILE" 2>/dev/null || echo "0")
      DUR_SEC=$(echo "$DURATION" | grep -oP '[\d.]+' || echo "0")
      if [ "$(echo "$DUR_SEC > 180" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
        DUR_MIN=$(echo "scale=1; $DUR_SEC/60" | bc -l 2>/dev/null || echo "?")
        pass "时长: ${DUR_MIN}分钟 (>3分钟)"
      elif [ "$(echo "$DUR_SEC > 0" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
        DUR_MIN=$(echo "scale=1; $DUR_SEC/60" | bc -l 2>/dev/null || echo "?")
        warn "时长: ${DUR_MIN}分钟 (不足3分钟)"
      else
        warn "无法解析时长"
      fi

      # 比特率
      BITRATE=$(ffprobe -v quiet -show_entries format=bit_rate -of csv=p=0 "$AUDIO_FILE" 2>/dev/null || echo "0")
      BR_KBPS=$(echo "scale=0; $BITRATE/1000" | bc -l 2>/dev/null || echo "0")
      if [ "$BR_KBPS" -gt 32 ] 2>/dev/null; then
        pass "比特率: ${BR_KBPS}kbps (>32kbps)"
      elif [ "$BR_KBPS" -gt 0 ] 2>/dev/null; then
        warn "比特率: ${BR_KBPS}kbps (偏低)"
      else
        warn "无法检测比特率"
      fi
    else
      warn "ffprobe 未安装，跳过时长/比特率检查"
    fi
  fi

  # 对话稿
  if [ -f "$DIALOGUE_FILE" ]; then
    DIALOGUE_LINES=$(wc -l < "$DIALOGUE_FILE" 2>/dev/null || echo "0")
    if [ "$DIALOGUE_LINES" -ge 30 ]; then
      pass "对话稿: $DIALOGUE_LINES 句 (≥30)"
    else
      warn "对话稿: $DIALOGUE_LINES 句 (偏少)"
    fi
  else
    warn "对话稿不存在 (generate-audio.js 可能未运行或出错)"
  fi
else
  echo "  (跳过 — 使用 --audio 开启音频检查)"
fi

# ── 第四步：构建 + 部署 ──
echo ""
echo "【4/4】构建与部署检查"

if [ -f "dist/index.html" ]; then
  pass "dist/index.html 存在 (构建完成)"
else
  warn "dist/ 不存在 — 请运行 npm run build"
fi

# 线上检查
SITE_URL="${SITE_URL:-https://ltaylor067758.github.io/daily-briefing/}"
HTTP_CODE=$(curl -o /dev/null -s -w '%{http_code}' -L "$SITE_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  pass "线上可访问: HTTP $HTTP_CODE"
elif [ "$HTTP_CODE" = "000" ]; then
  warn "无法连接线上 (网络问题或本地环境)"
else
  warn "线上状态: HTTP $HTTP_CODE"
fi

# 线上日期 (仅在可访问时检查)
if [ "$HTTP_CODE" = "200" ]; then
  ONLINE_DATE=$(curl -sL "$SITE_URL" 2>/dev/null | grep -oP "${TODAY}|${TODAY_CN}" | head -1 || echo "")
  if [ -n "$ONLINE_DATE" ]; then
    pass "线上日期匹配: $ONLINE_DATE"
  else
    warn "线上日期未匹配到今日 ($TODAY) — 可能尚未部署或缓存问题"
  fi
fi

# ── 总结 ──
echo ""
echo "========================================"
echo " 检查完成"
echo " 通过: $PASS  失败: $FAIL  警告: $WARN"
echo "========================================"

if [ "$FAIL" -gt 0 ]; then
  echo "结论: 发现问题，请修复后重新检查"
  exit 1
elif [ "$STRICT" = true ] && [ "$WARN" -gt 0 ]; then
  echo "结论: 严格模式 — 警告也算失败"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "结论: 通过 (有 $WARN 项警告，可忽略或加 --strict 严格检查)"
  exit 0
else
  echo "结论: 全部通过"
  exit 0
fi
