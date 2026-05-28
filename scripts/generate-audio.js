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
  let pendingDiscussion = '';

  const lines = mdContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ')) {
      if (currentSection) sections.push({ title: currentSection, items: currentItems });
      currentSection = line.replace('## ', '').trim();
      currentItems = [];
    }
    // Check for discussion comment on its own line
    const dMatch = line.match(/<!--\s*discuss:\s*(.+?)\s*-->/);
    if (dMatch) {
      pendingDiscussion = dMatch[1].trim();
      continue;
    }
    const itemMatch = line.match(/^\d+\.\s*\*\*\[?(.+?)\]?\*\*\s*[—\-]\s*(.+)/);
    if (itemMatch) {
      let summary = itemMatch[2].trim();
      summary = summary.replace(/\.{2,}\[阅读原文\]\([^)]+\)/, '').replace(/\[阅读原文\]\([^)]+\)/g, '').replace(/\*+/g, '').trim();
      const title = itemMatch[1].trim();
      currentItems.push({ title, summary, discussion: pendingDiscussion });
      pendingDiscussion = '';
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
  function add(speaker, voice, text) { s.push({ speaker, voice, text }); }

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
  add(M, mVoice, '先从国内开始吧。');

  // ===== 国内要闻 =====
  const domestic = sections.find(sec => sec.title.includes('国内'));
  if (domestic && domestic.items.length > 0) {
    const pickDomOpen = createPicker([
      '那先看看国内方面吧。', '咱们先从国内新闻开始。', '先聊聊国内的。',
      '先看国内。', '好，从国内新闻说起。',
    ]);
    add(F, fVoice, pickDomOpen());

    const top = domestic.items.slice(0, 3);
    const pickLead = createPicker([
      `今天国内最值得关注的一个事儿：{title}。具体来说呢，{summary}`,
      `国内方面有个事儿挺值得聊的。{title}。{summary}`,
      `先说说国内。{title}。我给大家展开一下，{summary}`,
      `国内今天最重磅的：{title}。{summary}`,
      `来看看国内。{title}。这个事儿呢，{summary}`,
    ]);
    const pickReact = createPicker([
      '这事儿影响确实不小。你怎么看？',
      '这个挺值得关注的。你觉得呢？',
      '嗯，这事儿背后有不少值得说的。',
      '这事儿值得多聊两句。你怎么看？',
      '这条信息量不小，展开说说？',
    ]);
    const pickAnalyze = createPicker([
      '这个趋势如果持续下去，影响面可能比表面看起来更大。',
      '有意思。这让我想到最近的一系列变化，似乎都在往同一个方向走。',
      '这事儿的关键点其实不在于事件本身，而是它释放的信号。',
      '我倒觉得这背后反映了一个更大的变化。',
      '这件事的连锁反应可能会持续一段时间。',
      '换个角度看，这其实是个积极信号。',
    ]);
    const pickNext = createPicker([
      '还有一条也挺重要的。', '另外值得一提的还有。',
      '再来看这条。', '下一条也挺有意思的。',
      '接着说。', '咱们接着看。',
    ]);

    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      if (i === 0) {
        add(M, mVoice, pickLead().replace('{title}', item.title).replace('{summary}', item.summary));
        add(F, fVoice, pickReact());
        add(M, mVoice, item.discussion || pickAnalyze());
      } else {
        add(F, fVoice, pickNext());
        const intro = `${item.title}。${item.summary}`;
        const extra = item.discussion ? ` ${item.discussion}` : '';
        add(M, mVoice, intro + extra);
      }
    }

    const rest = domestic.items.slice(3);
    if (rest.length > 0) {
      const pickRest = createPicker([
        `国内方面还有${rest.length === 1 ? '一条' : '几条'}值得了解的。`,
        `国内${rest.length === 1 ? '还有一条' : `另外还有${rest.length}条`}，快速过一下。`,
        `国内${rest.length === 1 ? '还剩一条' : `还剩${rest.length}条`}，简单提一下。`,
      ]);
      add(F, fVoice, pickRest());
      const titles = rest.map(r => r.title).join('；');
      add(M, mVoice, `简单说一下：${titles}。感兴趣的可以看文字版简报。`);
    }
  }

  // ===== 国际要闻 =====
  const intl = sections.find(sec => sec.title.includes('国际'));
  if (intl && intl.items.length > 0) {
    const pickIntlOpen = createPicker([
      '好，咱们把目光转向国际。', '来，看看国际方面。', '把视线转向国外。',
      '好，来关注一下国际上的大事。', '再来聊聊国际新闻。',
    ]);
    add(F, fVoice, pickIntlOpen());
    const top = intl.items.slice(0, 3);

    const pickIntlLead = createPicker([
      `今天国际上最大的焦点：{title}。{summary}`,
      `国际方面今天最受关注的是：{title}。具体来说，{summary}`,
      `先看国际上最大的一条新闻。{title}。{summary}`,
      `国际上今天最值得关注的：{title}。{summary}`,
      `先看国际。{title}。{summary}`,
    ]);
    const pickAskMore = createPicker([
      '那其他国际新闻呢？', '还有别的吗？', '国际上还有什么动向？',
      '还有哪些值得关注的？', '其他国家有什么动静？',
    ]);
    const pickIntlNext = createPicker([
      `另外还有：{title}。{summary}`,
      `再来看一条。{title}。{summary}`,
      `此外值得注意的还有。{title}，{summary}`,
      `还有一个事儿。{title}。{summary}`,
      `接着往下看。{title}。{summary}`,
      `再补充一个重要的。{title}。{summary}`,
      `还有一条国际新闻。{title}。{summary}`,
      `下一条。{title}。{summary}`,
    ]);
    const pickIntlReact = createPicker([
      '嗯，国际局势确实复杂。', '这影响面挺广的。', '了解。继续。',
      '嗯，值得关注后续发展。', '国际上的事越来越复杂了。',
    ]);

    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      if (i === 0) {
        add(M, mVoice, pickIntlLead().replace('{title}', item.title).replace('{summary}', item.summary));
        if (item.discussion) { add(F, fVoice, item.discussion); }
        if (top.length > 1) { add(F, fVoice, pickAskMore()); }
      } else {
        const intro = pickIntlNext().replace('{title}', item.title).replace('{summary}', item.summary);
        add(M, mVoice, intro + (item.discussion ? ` ${item.discussion}` : ''));
      }
      if (i > 0 && i < top.length - 1) { add(F, fVoice, pickIntlReact()); }
    }
    if (intl.items.length <= 1) {
      add(F, fVoice, '今天的国际新闻不算多，全球局势算是相对平静的一天。');
    }
  }

  // ===== AI 与科技 =====
  const ai = sections.find(sec => sec.title.includes('AI') || sec.title.includes('科技'));
  if (ai && ai.items.length > 0) {
    const pickAiOpen = createPicker([
      '最后咱们聊聊科技圈。今天AI领域又有不少新鲜事。',
      '最后来看看科技方面。AI圈每天都有新花样。',
      '来，最后说说科技和AI。最近这个领域变化太快了。',
      '最后来聊聊科技。每天都有让人眼前一亮的新进展。',
      '科技板块压轴。今天也有不少有意思的消息。',
    ]);
    add(F, fVoice, pickAiOpen());
    const top = ai.items.slice(0, 3);

    const pickAiLead = createPicker([
      `最让我兴奋的是这个：{title}。{summary}`,
      `今天科技圈最亮眼的：{title}。{summary}`,
      `先来一个我觉得特别有意思的。{title}。展开说说，{summary}`,
      `今天AI圈有个让我特别激动的消息。{title}。{summary}`,
      `先说一个重磅的。{title}。{summary}`,
    ]);
    const pickAiWow = createPicker([
      '哇，这个确实很有意思。技术发展比我们想象的快多了。',
      '这个厉害了。AI真的在改变每个行业。',
      '有意思。这可能会改变很多东西。',
      '这个方向确实值得关注。',
      '不得了，这个突破挺关键的。',
    ]);
    const pickAiNext = createPicker([
      '还有这条也挺重磅的。', '再来看一个。', '下一条也很值得聊。',
      '还有一条AI方面的。', '再聊一个。', '还有一个值得关注的。',
    ]);
    const pickAiLast = createPicker([
      '最后再提一个。', '还有一个我挺感兴趣的。', '再补充一条。',
      '最后一条了。', '收个尾，再说一个。', '最后再分享一个。',
    ]);

    for (let i = 0; i < top.length; i++) {
      const item = top[i];
      if (i === 0) {
        add(M, mVoice, pickAiLead().replace('{title}', item.title).replace('{summary}', item.summary));
        if (item.discussion) {
          add(F, fVoice, item.discussion);
        } else if (top.length === 1) {
          add(F, fVoice, pickAiWow());
        }
      } else if (i === 1) {
        add(F, fVoice, pickAiNext());
        add(M, mVoice, `${item.title}。说白了就是${item.summary}${item.discussion ? ' ' + item.discussion : ''}`);
      } else {
        add(F, fVoice, pickAiLast());
        add(M, mVoice, `${item.title}。${item.summary}${item.discussion ? ' ' + item.discussion : ''}`);
      }
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
      '嗯，挺有道理的。', '说得真好。', '每次的金句都让人想很多。',
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

  console.log(`生成 ${script.length} 个音频片段（SSML chat 风格）...`);
  const segmentFiles = [];

  // 构建批量 JSON
  const batchItems = script.map((line, i) => {
    const segFile = join(tmpDir, `${String(i + 1).padStart(3, '0')}.mp3`);
    segmentFiles.push(segFile);
    return {
      id: `${i + 1}/${script.length}`,
      voice: line.voice,
      text: line.text,
      output: segFile,
      rate: TTS_CONFIG.rate,
      pitch: line.voice === TTS_CONFIG.maleVoice ? '-3Hz' : '+3Hz',
    };
  });

  const batchFile = join(tmpDir, 'batch.json');
  writeFileSync(batchFile, JSON.stringify(batchItems, null, 2), 'utf-8');

  try {
    const ttsScript = join(__dirname, 'tts-batch.py');
    execSync(`python "${ttsScript}" "${batchFile}"`, { stdio: 'inherit', timeout: 180000 });
  } catch (err) {
    console.error('SSML 批量合成出错:', err.message);
  }

  // 验证哪些片段实际成功生成了
  const okFiles = segmentFiles.filter(f => existsSync(f));
  console.log(`成功: ${okFiles.length}/${segmentFiles.length} 个片段`);

  if (okFiles.length === 0) {
    console.error('没有成功生成任何片段');
    return;
  }

  // ffmpeg 拼接（只拼接实际存在的文件）
  const concatFile = join(tmpDir, 'concat.txt');
  writeFileSync(concatFile, okFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf-8');

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
