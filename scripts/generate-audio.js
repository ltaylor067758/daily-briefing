import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { TTS_CONFIG } from './lib/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'src', 'content', 'briefings');
const AUDIO_DIR = join(__dirname, '..', 'public', 'audio');

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function checkDeps() {
  let hasEdgeTts = false, hasFfmpeg = false;
  try {
    execSync('edge-tts --version 2>/dev/null || python -m edge_tts --version 2>/dev/null', { stdio: 'pipe' });
    hasEdgeTts = true;
  } catch {}
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    hasFfmpeg = true;
  } catch {}
  return { hasEdgeTts, hasFfmpeg };
}

function parseBriefing(mdContent) {
  // 解析简报，提取结构化数据
  const sections = [];
  let currentSection = null;
  let currentItems = [];
  let quote = '';

  for (const line of mdContent.split('\n')) {
    if (line.startsWith('## ')) {
      if (currentSection) sections.push({ title: currentSection, items: currentItems });
      currentSection = line.replace('## ', '').trim();
      currentItems = [];
    }
    const itemMatch = line.match(/^\d+\.\s*\*\*\[?(.+?)\]?\*\*\s*[—\-]\s*(.+)/);
    if (itemMatch) {
      let summary = itemMatch[2].trim();
      summary = summary.replace(/\.{2,}\[阅读原文\]\([^)]+\)/, '').replace(/\[阅读原文\]\([^)]+\)/g, '').replace(/\*+/g, '').trim();
      currentItems.push({ title: itemMatch[1].trim(), summary });
    }
    if (line.match(/^>\s*\*\*今日金句/)) {
      const qMatch = line.match(/>\s*\*\*今日金句\*\*[：:]\s*(.+)/);
      if (qMatch) quote = qMatch[1].trim();
    }
  }
  if (currentSection) sections.push({ title: currentSection, items: currentItems });
  return { sections, quote };
}

function buildConversation(briefing, dateChinese) {
  const { sections, quote } = briefing;
  const M = '男'; const F = '女';
  const mVoice = TTS_CONFIG.maleVoice;
  const fVoice = TTS_CONFIG.femaleVoice;
  let s = [];
  function add(speaker, voice, text) { s.push({ speaker, voice, text }); }

  // ===== 开场：轻松自然 =====
  add(M, mVoice, `嘿，各位好，今天是${dateChinese}，欢迎收听每日简报。我是云希。`);
  add(F, fVoice, '我是小晓。');
  add(M, mVoice, '今天新闻不少，咱们捡重点的聊聊。');
  add(F, fVoice, '对，不念稿，就挑几个最有意思的说说。');

  // ===== 国内要闻 =====
  const domestic = sections.find(sec => sec.title.includes('国内'));
  if (domestic && domestic.items.length > 0) {
    add(F, fVoice, '那先看看国内方面吧。');

    // 挑前3条重点展开讨论
    const top = domestic.items.slice(0, 3);
    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      if (i === 0) {
        add(M, mVoice, `今天国内最值得关注的一个事儿：${item.title}。具体来说呢，${item.summary}`);
        add(F, fVoice, '这事儿确实影响不小。你怎么看？');
        add(M, mVoice, `我觉得这反映了一个大趋势。${i === 0 && item.summary.length > 20 ? '政策层面在往更规范、更透明的方向走。' : '值得继续观察后续发展。'}`);
      } else {
        const connectors = ['还有一条也挺重要的。', '另外值得一提的还有。', '再来看这条。'];
        add(F, fVoice, connectors[i - 1]);
        add(M, mVoice, `${item.title}。${item.summary}`);
      }
      // 互动
      if (i < top.length - 1) {
        add(F, fVoice, '嗯，这条信息量不小。');
      }
    }

    // 如果还有更多，简要提一下
    const rest = domestic.items.slice(3);
    if (rest.length > 0) {
      add(F, fVoice, `国内方面还有${rest.length === 1 ? '一条' : '几条'}值得了解的。`);
      const titles = rest.map(r => r.title).join('；');
      add(M, mVoice, `简单过一下：${titles}。感兴趣的可以看文字版简报。`);
    }
  }

  // ===== 国际要闻 =====
  const intl = sections.find(sec => sec.title.includes('国际'));
  if (intl && intl.items.length > 0) {
    add(F, fVoice, '好，咱们把目光转向国际。');
    const top = intl.items.slice(0, 2);
    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      add(M, mVoice, `今天国际上最大的焦点：${item.title}。${item.summary}`);
      if (i < top.length - 1) {
        add(F, fVoice, `那另一条国际新闻呢？`);
      }
    }
    if (intl.items.length <= 1) {
      add(F, fVoice, '今天的国际新闻不算多，但这正好说明全球局势相对平静。');
    }
  }

  // ===== AI 与科技 =====
  const ai = sections.find(sec => sec.title.includes('AI') || sec.title.includes('科技'));
  if (ai && ai.items.length > 0) {
    add(F, fVoice, '最后咱们聊聊科技圈。今天AI领域又有不少新鲜事。');
    const top = ai.items.slice(0, 3);
    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      if (i === 0) {
        add(M, mVoice, `最让我兴奋的是这个：${item.title}。${item.summary}`);
        add(F, fVoice, `哇，这个确实很有意思。技术发展比我们想象的快多了。`);
      } else if (i === 1) {
        add(F, fVoice, `还有这条也挺重磅的。`);
        add(M, mVoice, `${item.title}。说白了就是${item.summary}`);
      } else {
        add(F, fVoice, `最后再提一个。`);
        add(M, mVoice, `${item.title}。${item.summary}`);
      }
    }
  }

  // ===== 金句 =====
  if (quote) {
    add(F, fVoice, '好，又到了每天金句时间。');
    add(M, mVoice, `今天想跟大家分享的一句话：${quote}`);
    add(F, fVoice, '挺有启发的。你们觉得呢？');
  }

  // ===== 结束语 =====
  add(M, mVoice, '好了，今天就聊到这儿。');
  add(F, fVoice, '每天早上九点，我们准时更新。想看完整文字版可以访问我们的网站。');
  add(M, mVoice, '我是云希。');
  add(F, fVoice, '我是小晓。');
  add(M, mVoice, '明天见！');

  return s;
}

async function main() {
  console.log('=== 语音播客生成 ===');

  const deps = checkDeps();
  console.log(`环境: edge-tts=${deps.hasEdgeTts}, ffmpeg=${deps.hasFfmpeg}`);

  const dateStr = getTodayDate();
  const briefingFile = join(CONTENT_DIR, `${dateStr}.md`);

  if (!existsSync(briefingFile)) {
    console.error(`找不到简报文件: ${briefingFile}`);
    process.exit(1);
  }

  const mdContent = readFileSync(briefingFile, 'utf-8');
  const briefing = parseBriefing(mdContent);
  console.log(`解析: ${briefing.sections.length} 个版块, ${briefing.sections.reduce((sum, s) => sum + s.items.length, 0)} 条新闻`);

  const d = new Date();
  const dateChinese = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

  const script = buildConversation(briefing, dateChinese);
  console.log(`对话脚本: ${script.length} 句`);

  // 保存对话稿
  const scriptsDir = join(__dirname, '..', 'public', 'scripts');
  if (!existsSync(scriptsDir)) mkdirSync(scriptsDir, { recursive: true });
  const scriptText = script.map(l => `【${l.speaker}】${l.text}`).join('\n\n');
  writeFileSync(join(scriptsDir, `${dateStr}-dialogue.txt`), scriptText, 'utf-8');
  console.log('✓ 对话稿已保存');

  if (!deps.hasEdgeTts) {
    console.log('\n⚠ 缺少 edge-tts，跳过音频生成');
    return;
  }

  // 生成音频
  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
  const tmpDir = join(AUDIO_DIR, 'tmp_' + dateStr);
  mkdirSync(tmpDir, { recursive: true });

  console.log(`生成 ${script.length} 个音频片段...`);
  const segmentFiles = [];

  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const segFile = join(tmpDir, `${String(i + 1).padStart(3, '0')}.mp3`);
    const safeText = line.text.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

    try {
      execSync(
        `edge-tts --voice ${line.voice} --text "${safeText}" --write-media "${segFile}"`,
        { stdio: 'pipe', timeout: 30000 }
      );
      segmentFiles.push(segFile);
      console.log(`  [${i + 1}/${script.length}] ✓ ${line.speaker}`);
    } catch (err) {
      console.error(`  [${i + 1}/${script.length}] ✗: ${err.message}`);
    }
  }

  if (segmentFiles.length === 0) {
    console.error('没有成功生成任何片段');
    return;
  }

  // ffmpeg 拼接
  const concatFile = join(tmpDir, 'concat.txt');
  writeFileSync(concatFile, segmentFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf-8');

  const outputFile = join(AUDIO_DIR, `${dateStr}.mp3`);
  console.log('拼接音频...');
  execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}" -y`, {
    stdio: 'pipe', timeout: 120000,
  });

  execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe' });
  console.log(`✓ 已生成 ${outputFile}`);
  console.log('=== 音频处理完成 ===');
}

main().catch(err => {
  console.error('音频生成出错:', err.message);
  console.log('站点仍可正常构建（无音频）');
});
