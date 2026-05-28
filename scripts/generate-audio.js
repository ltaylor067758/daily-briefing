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

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildConversation(briefing, dateChinese) {
  const { sections, quote } = briefing;
  const M = '男'; const F = '女';
  const mVoice = TTS_CONFIG.maleVoice;
  const fVoice = TTS_CONFIG.femaleVoice;
  let s = [];
  function add(speaker, voice, text) { s.push({ speaker, voice, text }); }

  // ===== 开场：轻松自然 =====
  const openings = [
    `嘿，早上好。今天是${dateChinese}，欢迎收听每日简报。我是云希。`,
    `各位听众朋友们好，${dateChinese}，又到了每日简报的时间。我是云希。`,
    `大家好，${dateChinese}，每日简报准时和你见面。我是云希。`,
  ];
  add(M, mVoice, pick(openings));
  add(F, fVoice, '我是小晓。');
  add(M, mVoice, pick(['今天新闻不少，咱们捡重点的聊聊。', '今天有不少值得关注的消息，咱们挑重点说。', '今天信息量挺大，咱们慢慢聊。']));
  add(F, fVoice, pick(['对，不念稿，就挑几个最有意思的说说。', '没错，挑几个真正值得展开的聊一聊。', '对，不追求数量，聊透几个热点就好。']));

  // ===== 国内要闻 =====
  const domestic = sections.find(sec => sec.title.includes('国内'));
  if (domestic && domestic.items.length > 0) {
    add(F, fVoice, pick(['那先看看国内方面吧。', '咱们先从国内新闻开始。', '先聊聊国内的。']));

    const top = domestic.items.slice(0, 3);
    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      if (i === 0) {
        const leads = [
          `今天国内最值得关注的一个事儿：${item.title}。具体来说呢，${item.summary}`,
          `国内方面，今天有个事儿挺值得聊一聊。${item.title}。${item.summary}`,
          `先说说国内。${item.title}。我给大家展开一下，${item.summary}`,
        ];
        add(M, mVoice, pick(leads));
        const reactions = [
          '这事儿影响确实不小。你怎么看？',
          '这个挺值得关注的。你觉得呢？',
          '嗯，这事儿背后有不少值得说的。',
        ];
        add(F, fVoice, pick(reactions));
        const analyses = [
          '我觉得背后反映了一个趋势，政策在往更规范、更透明的方向走。',
          '其实仔细想想，这说明市场在逐渐成熟，规则意识越来越强了。',
          '我认为这件事的信号意义很大，后续可能会有更多配套措施出来。',
          '这件事的影响可能会持续一段时间，值得继续观察。',
        ];
        add(M, mVoice, pick(analyses));
      } else {
        const connectors = [
          '还有一条也挺重要的。', '另外值得一提的还有。', '再来看这条。',
          '我这儿还有一条。', '下一条也挺有意思的。', '接着说。',
        ];
        add(F, fVoice, pick(connectors));
        add(M, mVoice, `${item.title}。${item.summary}`);
      }
    }

    const rest = domestic.items.slice(3);
    if (rest.length > 0) {
      add(F, fVoice, pick([
        `国内方面还有${rest.length === 1 ? '一条' : '几条'}值得了解的。`,
        `国内${rest.length === 1 ? '还有一条' : `另外还有${rest.length}条`}，快速过一下。`,
      ]));
      const titles = rest.map(r => r.title).join('；');
      add(M, mVoice, `简单说一下：${titles}。感兴趣的可以看文字版简报。`);
    }
  }

  // ===== 国际要闻 =====
  const intl = sections.find(sec => sec.title.includes('国际'));
  if (intl && intl.items.length > 0) {
    add(F, fVoice, pick(['好，咱们把目光转向国际。', '来，看看国际方面。', '把视线转向国外。']));
    const top = intl.items.slice(0, 3);
    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      if (i === 0) {
        const leads = [
          `今天国际上最大的焦点：${item.title}。${item.summary}`,
          `国际方面今天最受关注的是：${item.title}。具体来说，${item.summary}`,
          `先看国际上最大的一条新闻。${item.title}。${item.summary}`,
        ];
        add(M, mVoice, pick(leads));
        if (top.length > 1) {
          add(F, fVoice, pick(['那其他国际新闻呢？', '还有别的吗？', '国际上还有什么动向？']));
        }
      } else {
        const intros = [
          `另外还有：${item.title}。${item.summary}`,
          `再来看一条。${item.title}。${item.summary}`,
          `此外值得注意的还有。${item.title}，${item.summary}`,
          `还有一个事儿。${item.title}。${item.summary}`,
          `接着往下看。${item.title}。${item.summary}`,
          `再补充一个重要的。${item.title}。${item.summary}`,
        ];
        add(M, mVoice, pick(intros));
      }
      if (i > 0 && i < top.length - 1) {
        add(F, fVoice, pick(['嗯，国际局势确实复杂。', '这影响面挺广的。', '了解。继续。']));
      }
    }
    if (intl.items.length <= 1) {
      add(F, fVoice, '今天的国际新闻不算多，但这正好说明全球局势相对平静。');
    }
  }

  // ===== AI 与科技 =====
  const ai = sections.find(sec => sec.title.includes('AI') || sec.title.includes('科技'));
  if (ai && ai.items.length > 0) {
    add(F, fVoice, pick([
      '最后咱们聊聊科技圈。今天AI领域又有不少新鲜事。',
      '最后来看看科技方面。AI圈每天都有新花样。',
      '来，最后说说科技和AI。最近这个领域变化太快了。',
    ]));
    const top = ai.items.slice(0, 3);
    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      if (i === 0) {
        const leads = [
          `最让我兴奋的是这个：${item.title}。${item.summary}`,
          `今天科技圈最亮眼的：${item.title}。${item.summary}`,
          `先来一个我觉得特别有意思的。${item.title}。展开说说，${item.summary}`,
        ];
        add(M, mVoice, pick(leads));
        if (top.length === 1) {
          add(F, fVoice, pick([
            '哇，这个确实很有意思。技术发展比我们想象的快多了。',
            '这个厉害了。AI真的在改变每个行业。',
            '有意思。这可能会改变很多东西。',
            '这个方向确实值得关注。',
          ]));
        }
      } else if (i === 1) {
        add(F, fVoice, pick(['还有这条也挺重磅的。', '再来看一个。', '下一条也很值得聊。']));
        add(M, mVoice, `${item.title}。说白了就是${item.summary}`);
      } else {
        add(F, fVoice, pick(['最后再提一个。', '还有一个我挺感兴趣的。', '再补充一条。']));
        add(M, mVoice, `${item.title}。${item.summary}`);
      }
    }
  }

  // ===== 金句 =====
  if (quote) {
    add(F, fVoice, pick(['好，又到了每天金句时间。', '来，今天的每日金句。', '最后，分享一下今天的金句。']));
    add(M, mVoice, `今天想跟大家分享的一句话：${quote}`);
    add(F, fVoice, pick(['挺有启发的。你们觉得呢？', '这句话值得琢磨一下。', '嗯，挺有道理的。', '说得真好。']));
  }

  // ===== 结束语 =====
  add(M, mVoice, pick(['好了，今天就聊到这儿。', '好，今天的简报就到这里。', '行，今天的内容就是这些了。']));
  add(F, fVoice, '每天早上九点，我们准时更新。想看完整文字版可以访问我们的网站。');
  add(M, mVoice, '我是云希。');
  add(F, fVoice, '我是小晓。');
  add(M, mVoice, pick(['明天见！', '下期见！', '明天同一时间，不见不散！']));

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
