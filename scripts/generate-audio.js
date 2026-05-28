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
  const sections = [];
  let currentSection = null;
  let currentItems = [];
  let quote = '';

  const lines = mdContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      if (currentSection) sections.push({ title: currentSection, items: currentItems });
      currentSection = line.replace('## ', '').trim();
      currentItems = [];
    }
    const itemMatch = line.match(/^\d+\.\s*\*\*\[?(.+?)\]?\*\*\s*[—\-]\s*(.+)/);
    if (itemMatch) {
      let summary = itemMatch[2].trim();
      summary = summary.replace(/\.{2,}\[阅读原文\]\([^)]+\)/, '').replace(/\[阅读原文\]\([^)]+\)/g, '').replace(/\*+/g, '').trim();
      const title = itemMatch[1].trim();
      // Peek at next line for discussion comment
      let discussion = '';
      if (i + 1 < lines.length) {
        const dMatch = lines[i + 1].match(/<!--\s*discuss:\s*(.+?)\s*-->/);
        if (dMatch) {
          discussion = dMatch[1].trim();
          i++; // consume the discussion line
        }
      }
      currentItems.push({ title, summary, discussion });
    }
    if (line.match(/^>\s*\*\*今日金句/)) {
      const qMatch = line.match(/>\s*\*\*今日金句\*\*[：:]\s*(.+)/);
      if (qMatch) quote = qMatch[1].trim();
    }
  }
  if (currentSection) sections.push({ title: currentSection, items: currentItems });
  return { sections, quote };
}

// 避免连续重复的选择器
function createPicker(arr) {
  let last = -1;
  return () => {
    let i;
    do { i = Math.floor(Math.random() * arr.length); } while (i === last && arr.length > 1);
    last = i;
    return arr[i];
  };
}

function buildConversation(briefing, dateChinese) {
  const { sections, quote } = briefing;
  const M = '男'; const F = '女';
  const mVoice = TTS_CONFIG.maleVoice;
  const fVoice = TTS_CONFIG.femaleVoice;
  let s = [];
  let lastSpeaker = null;
  function add(speaker, voice, text) { s.push({ speaker, voice, text }); lastSpeaker = speaker; }

  // 短促回应，模拟聊天中的"嗯"、"对的"
  const chimed = { count: 0 };
  function chime(voice) {
    // 每 8 句左右来一次自然的插话
    if (chimed.count > 0 && Math.random() > 0.3) return;
    const pool = ['嗯。', '对的。', '是这个意思。', '确实。', '没错。'];
    const pick = pool[Math.floor(Math.random() * pool.length)];
    add(lastSpeaker === M ? F : M, voice, pick);
    chimed.count = 0;
  }
  chimed.count = Math.floor(Math.random() * 3);

  // ===== 开场 =====
  const pickOpen = createPicker([
    `嘿，早上好。今天是${dateChinese}，欢迎收听七尺的每日新闻播客。`,
    `各位听众朋友们好，${dateChinese}，欢迎收听七尺的每日新闻播客。`,
    `大家好，${dateChinese}，七尺的每日新闻播客准时和你见面。`,
    `早上好！${dateChinese}，欢迎来到七尺的每日新闻播客。`,
    `各位好，今天是${dateChinese}，七尺每日新闻播客如约而至。`,
  ]);
  add(M, mVoice, pickOpen());
  const pickChat = createPicker([
    '今天信息量不小，咱们慢慢来。',
    '今天有不少值得关注的消息。',
    '今天热点挺密集的，咱们一块看看。',
    '今天内容挺丰富的，来。',
    '今天有几条新闻挺有聊头的。',
  ]);
  add(F, fVoice, pickChat());
  add(M, mVoice, '嗯，先从国内开始吧。');

  // ===== 通用：聊一条新闻（自然对话流）=====
  // presenter说新闻 → reactor回应/追问 → presenter分享讨论角度 → 有时reactor追加一句
  function chatNewsItem(item, presenter, reactor, pVoice, rVoice, isFirst) {
    if (!isFirst) {
      // 自然的过渡：不总是完整句子，有时就是一个词
      const transitions = [
        '还有一条。', '接着说。',
        '下一条也挺有意思。', '再来看这个。',
        '还有一个事儿。',
      ];
      const t = transitions[Math.floor(Math.random() * transitions.length)];
      add(reactor, rVoice, t);
    }

    // Presenter 说出新闻
    const leads = [
      `${item.title}。具体来说呢，${item.summary}`,
      `${item.title}。我给大家展开一下，${item.summary}`,
      `${item.title}。这个事儿呢，${item.summary}`,
      `${item.title}。${item.summary}`,
    ];
    add(presenter, pVoice, leads[Math.floor(Math.random() * leads.length)]);

    chimed.count++;

    // Reactor 的反应：多是短句，偶尔追问
    const shortReacts = ['嗯，然后呢？', '这怎么讲？', '怎么说？', '嗯？', '有意思。'];
    const longReacts = [
      '这事儿影响不小，展开说说？',
      '这个有意思，你是怎么看的？',
      '我注意到了这个，背后的逻辑是什么？',
    ];
    const react = Math.random() < 0.6
      ? shortReacts[Math.floor(Math.random() * shortReacts.length)]
      : longReacts[Math.floor(Math.random() * longReacts.length)];
    add(reactor, rVoice, react);

    // Presenter 分享讨论角度
    const discussion = item.discussion || '';
    if (discussion) {
      add(presenter, pVoice, discussion);
      chimed.count++;
      // 偶尔 reactor 简单回应
      if (Math.random() < 0.35) {
        const agree = ['嗯，有道理。', '了解了。', '明白。', '确实是这样。'];
        add(reactor, rVoice, agree[Math.floor(Math.random() * agree.length)]);
      }
    }

    // 有时两个人会多聊一句（30%概率）
    if (Math.random() < 0.3 && discussion) {
      const extras = [
        '这么说的话，后续还值得关注。',
        '对，这个方向我们后续再看看。',
        '嗯，这个点到为止，接着看下一条。',
      ];
      const extra = extras[Math.floor(Math.random() * extras.length)];
      // 谁接这句话取决于当前节奏
      add(lastSpeaker === presenter ? reactor : presenter,
          lastSpeaker === presenter ? rVoice : pVoice, extra);
    }
  }

  // ===== 国内要闻 =====
  const domestic = sections.find(sec => sec.title.includes('国内'));
  if (domestic && domestic.items.length > 0) {
    const domOpen = '先看看国内方面吧。';
    add(F, fVoice, domOpen);
    const top = domestic.items.slice(0, 3);
    for (let i = 0; i < top.length; i++) {
      // 轮流主导：第一条男主导，第二条女主导，第三条男主导...
      const presenter = i % 2 === 0 ? M : F;
      const reactor = presenter === M ? F : M;
      const pVoice = presenter === M ? mVoice : fVoice;
      const rVoice = reactor === M ? mVoice : fVoice;
      chatNewsItem(top[i], presenter, reactor, pVoice, rVoice, i === 0);
    }
    // 其余简述
    const rest = domestic.items.slice(3);
    if (rest.length > 0) {
      const n = rest.length;
      const restIntro = n === 1 ? '国内还有一条，快速提一下。' : `国内还有${n}条，快速过一下。`;
      add(F, fVoice, restIntro);
      add(M, mVoice, rest.map(r => r.title).join('；') + '。感兴趣的可以看文字版。');
    }
  }

  // ===== 国际要闻 =====
  const intl = sections.find(sec => sec.title.includes('国际'));
  if (intl && intl.items.length > 0) {
    const intlOpens = ['来，把目光转向国际。', '好，看看国际上的大事。', '来看国际方面。'];
    add(F, fVoice, intlOpens[Math.floor(Math.random() * intlOpens.length)]);
    const top = intl.items.slice(0, 3);
    for (let i = 0; i < top.length; i++) {
      const presenter = i % 2 === 0 ? M : F;
      const reactor = presenter === M ? F : M;
      const pVoice = presenter === M ? mVoice : fVoice;
      const rVoice = reactor === M ? mVoice : fVoice;
      chatNewsItem(top[i], presenter, reactor, pVoice, rVoice, i === 0);
    }
    if (intl.items.length <= 1) {
      add(F, fVoice, '今天国际新闻不算多，全球局势还算平静。');
    }
  }

  // ===== AI 与科技 =====
  const ai = sections.find(sec => sec.title.includes('AI') || sec.title.includes('科技'));
  if (ai && ai.items.length > 0) {
    const aiOpens = [
      '最后聊聊科技。AI圈每天都有新花样。',
      '最后来看看科技和AI，最近变化太快了。',
      '科技板块压轴，今天也有不少有意思的。',
      '来，最后说说科技。每天都有让人眼前一亮的新进展。',
    ];
    add(F, fVoice, aiOpens[Math.floor(Math.random() * aiOpens.length)]);
    const top = ai.items.slice(0, 3);
    for (let i = 0; i < top.length; i++) {
      // AI板块让女声也主导一条，换换节奏
      const presenter = i === 1 ? F : M;
      const reactor = presenter === M ? F : M;
      const pVoice = presenter === M ? mVoice : fVoice;
      const rVoice = reactor === M ? mVoice : fVoice;
      chatNewsItem(top[i], presenter, reactor, pVoice, rVoice, i === 0);
    }
  }

  // ===== 金句 =====
  if (quote) {
    const pickQuoteIntro = createPicker([
      '好，又到了每天金句时间。', '来，今天的每日金句。',
      '最后，分享一下今天的金句。', '又到了我最喜欢金句环节。',
    ]);
    add(F, fVoice, pickQuoteIntro());
    add(M, mVoice, `今天想跟大家分享的一句话：${quote}`);
    const pickQuoteReact = createPicker([
      '挺有启发的。你们觉得呢？', '这句话值得琢磨一下。',
      '嗯，挺有道理的。', '说得真好。',
    ]);
    add(F, fVoice, pickQuoteReact());
  }

  // ===== 结束语 =====
  const pickEnd = createPicker([
    '好了，今天就聊到这儿。', '好，今天的简报就到这里。',
    '行，今天的内容就是这些了。', '好，以上就是今天的所有内容。',
    '今天的简报到此结束。',
  ]);
  add(M, mVoice, pickEnd());
  add(F, fVoice, '每天早上九点，我们准时更新。想看完整文字版可以访问我们的网站。');
  const pickBye = createPicker([
    '明天见！', '下期见！', '明天同一时间，不见不散！',
    '咱们明天继续！', '明天见，拜拜！',
  ]);
  add(F, fVoice, pickBye());

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

  // ===== 自检：确保 edge-tts 工作正常 =====
  console.log('自检 edge-tts...');
  try {
    execSync(`edge-tts --voice ${TTS_CONFIG.femaleVoice} --text "测试" --write-media /tmp/tts_test.mp3 --rate=-5%`, { stdio: 'pipe', timeout: 15000 });
    console.log('  ✓ edge-tts 工作正常');
  } catch (err) {
    console.error('  ✗ edge-tts 自检失败:', err.message);
    return;
  }

  // 生成音频
  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
  const tmpDir = join(AUDIO_DIR, 'tmp_' + dateStr);
  mkdirSync(tmpDir, { recursive: true });

  // 先删掉旧音频，确保不会被错误提交
  const outputFile = join(AUDIO_DIR, `${dateStr}.mp3`);
  if (existsSync(outputFile)) {
    console.log('删除旧音频文件...');
    execSync(`rm -f "${outputFile}"`, { stdio: 'pipe' });
  }

  console.log(`生成 ${script.length} 个音频片段...`);
  const segmentFiles = [];

  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const segFile = join(tmpDir, `${String(i + 1).padStart(3, '0')}.mp3`);
    const safeText = line.text.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    const pitch = line.voice === TTS_CONFIG.maleVoice ? '-3Hz' : '+3Hz';

    try {
      execSync(
        `edge-tts --voice ${line.voice} --rate=${TTS_CONFIG.rate} --pitch=${pitch} --text "${safeText}" --write-media "${segFile}"`,
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
