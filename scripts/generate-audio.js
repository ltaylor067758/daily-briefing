import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import Anthropic from '@anthropic-ai/sdk';
import { TTS_CONFIG, DIALOGUE_SYSTEM_PROMPT } from './lib/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'src', 'content', 'briefings');
const AUDIO_DIR = join(__dirname, '..', 'public', 'audio');

// DSV4 client for dialogue generation
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
});
const MODEL = process.env.ANTHROPIC_MODEL || 'deepseek-v4-pro';

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getPython() {
  // 优先使用 conda cosyvoice 环境的 Python（Windows）
  const condaPython = join('C:', 'Users', '25881', 'miniforge3', 'envs', 'cosyvoice', 'python.exe');
  if (existsSync(condaPython)) return condaPython;
  return process.platform === 'win32' ? 'python' : 'python3';
}

function checkDeps() {
  let hasEdgeTts = false, hasCosyVoice = false, hasFfmpeg = false;
  const python = getPython();
  try {
    execSync('edge-tts --version 2>/dev/null || python -m edge_tts --version 2>/dev/null || python3 -m edge_tts --version 2>/dev/null', { stdio: 'pipe' });
    hasEdgeTts = true;
  } catch {}
  try {
    // CosyVoice 2: 用临时 Python 文件检测，避免 shell 转义问题
    const cosyvoiceDir = join(__dirname, '..', '..', 'CosyVoice');
    const matchaDir = join(cosyvoiceDir, 'third_party', 'Matcha-TTS');
    const checkScript = join(tmpdir(), 'check_cosyvoice.py');
    writeFileSync(checkScript, `
import sys
sys.path.insert(0, r"${cosyvoiceDir}")
sys.path.insert(0, r"${matchaDir}")
from cosyvoice.cli.cosyvoice import CosyVoice2
print("OK")
`);
    execSync(`"${python}" "${checkScript}"`, { stdio: 'pipe' });
    try { unlinkSync(checkScript); } catch {}
    hasCosyVoice = true;
  } catch {}
  try {
    const ffmpeg = join('C:', 'Users', '25881', 'miniforge3', 'envs', 'cosyvoice', 'Library', 'bin', 'ffmpeg.exe');
    if (existsSync(ffmpeg)) {
      execSync(`"${ffmpeg}" -version`, { stdio: 'pipe' });
      hasFfmpeg = true;
    } else {
      execSync('ffmpeg -version', { stdio: 'pipe' });
      hasFfmpeg = true;
    }
  } catch {}
  return { hasEdgeTts, hasCosyVoice, hasFfmpeg };
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
      let discussion = '';
      if (i + 1 < lines.length) {
        const dMatch = lines[i + 1].match(/<!--\s*discuss:\s*(.+?)\s*-->/);
        if (dMatch) {
          discussion = dMatch[1].trim();
          i++;
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

// ===== LLM 生成整场对话（替代模板） =====
async function generateConversation(briefing, dateChinese) {
  const { sections, quote } = briefing;

  // 构建新闻内容输入
  let newsText = '';
  for (const sec of sections) {
    newsText += `\n## ${sec.title}\n\n`;
    for (let i = 0; i < sec.items.length; i++) {
      const item = sec.items[i];
      newsText += `[${i + 1}] ${item.title}\n`;
      newsText += `    摘要: ${item.summary}\n`;
      if (item.discussion) {
        newsText += `    讨论角度: ${item.discussion}\n`;
      }
      newsText += '\n';
    }
  }

  const systemPrompt = `你是一位顶级播客内容导演。你的任务是为"每日简报"播客写一段男女双人对话脚本。

## 核心要求：像朋友聊天，不念稿

**这是最重要的规则：你写的是两个朋友在聊天，不是在交替朗读新闻。**

### 对话风格
- 像两个圈内朋友在聊今天发生的事：随意、有态度、有情绪
- 一个人说话时另一个会插嘴、追问、表示赞同或反对
- 好的新闻多聊几轮，深入讨论；一般的新闻一两句带过
- 语调随内容浮动：严肃的事压低语气，荒诞的事可以调侃
- 允许短暂的跑题、联想、类比（但最终拉回来）
- 用口语：说"这事儿"不说"该事件"，说"挺逗的"不说"颇为有趣"
- 偶尔用语气词：哎、嗯、哈、啧啧、是吧、我跟你讲

### 节奏规则
- **不要严格轮流**。有时候男的说两段，女的说一段；有时候女的连续追问
- 关键热点展开 2-3 轮对话（A说新闻 → B反应 → A补充角度 → B追问/总结 → 换话题）
- 次要新闻合并简述：一人快速过 2-3 条标题+一句话
- 全文一共 35-55 句

### 角色设定
- **男（云希）**：理性分析型。喜欢挖逻辑、找因果、做类比。偶尔冷幽默。
- **女（小晓）**：直觉感受型。善于发现事件对人的影响，会带情绪评论。节奏感好，负责推进话题转换。

### 结构参考（不要生硬套用，自然流转）
- 开场：互打招呼，一两句导入（3-5句）
- 国内：挑 2-3 个最有讨论价值的深度聊，其余快速过（12-18句）
- 国际：同样逻辑（10-15句）
- AI/科技：挑最有意思的聊，语气可以兴奋一点（8-12句）
- 金句：自然引出，一人读一人点评（3-5句）
- 结束：简短道别，预告明天（3-4句）

### 输出格式
每行格式：男：xxx 或 女：xxx
不要序号、不要 Markdown、不要任何格式标记。
每句话 10-40 字为宜，太长 TTS 合成不自然。

### 金句
今天的金句是：${quote || '随机生成一句有启发的话'}
在对话结尾处，由男主持自然读出金句，女主持简单回应。`;

  const userPrompt = `今天是${dateChinese}，以下是今天的新闻简报。请按系统指令写一场自然有趣的双人播客对话。

${newsText}

重要：写出人味，写出态度。这不是新闻播报，是两个朋友在聊今天发生的事。直接输出对话，每行"男：xxx"或"女：xxx"。`;

  console.log('发送简报给 AI 生成对话...');
  console.log(`新闻内容: ${sections.reduce((s, sec) => s + sec.items.length, 0)} 条, prompt ${userPrompt.length} 字符`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.9,
  });

  const content = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  console.log(`AI 对话长度: ${content.length} 字符, tokens: in=${response.usage?.input_tokens} out=${response.usage?.output_tokens}`);

  // 解析对话脚本
  const script = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let speaker, voice, text;
    const maleMatch = trimmed.match(/^(男|M|Male)[：:]\s*(.+)/i);
    const femaleMatch = trimmed.match(/^(女|F|Female)[：:]\s*(.+)/i);

    if (maleMatch) {
      speaker = '男'; voice = TTS_CONFIG.maleVoice; text = maleMatch[2].trim();
    } else if (femaleMatch) {
      speaker = '女'; voice = TTS_CONFIG.femaleVoice; text = femaleMatch[2].trim();
    } else {
      continue;
    }

    if (text.length > 0) {
      script.push({ speaker, voice, text });
    }
  }

  return script;
}

// 降级：简单对话生成（LLM 不可用时）
function buildFallbackConversation(briefing, dateChinese) {
  const { sections, quote } = briefing;
  const M = '男'; const F = '女';
  const mVoice = TTS_CONFIG.maleVoice;
  const fVoice = TTS_CONFIG.femaleVoice;
  const script = [];
  let lastSpeaker = null;

  function add(speaker, voice, text) { script.push({ speaker, voice, text }); lastSpeaker = speaker; }

  add(M, mVoice, `嘿，早上好。今天是${dateChinese}，欢迎收听七尺的每日新闻播客。`);
  add(F, fVoice, '今天信息量不小，咱们慢慢聊。');
  add(M, mVoice, '先从国内开始。');

  for (const sec of sections) {
    for (let i = 0; i < sec.items.length; i++) {
      const item = sec.items[i];
      const presenter = i % 2 === 0 ? M : F;
      const reactor = presenter === M ? F : M;
      const pVoice = presenter === M ? mVoice : fVoice;
      const rVoice = reactor === M ? mVoice : fVoice;

      if (i > 0) {
        const t = ['接着说。', '还有一条。', '再来看这个。'][Math.floor(Math.random() * 3)];
        add(reactor, rVoice, t);
      }
      add(presenter, pVoice, `${item.title}。${item.summary}`);
      add(reactor, rVoice, ['嗯，然后呢？', '这怎么讲？', '展开说说？'][Math.floor(Math.random() * 3)]);
      if (item.discussion) {
        add(presenter, pVoice, item.discussion);
      }
    }
  }

  if (quote) {
    add(F, fVoice, '今天的金句时间到了。');
    add(M, mVoice, quote);
    add(F, fVoice, '挺有道理的。');
  }

  add(M, mVoice, '好，以上就是今天的所有内容。');
  add(F, fVoice, '每天早上九点，我们准时更新。明天见！');
  return script;
}

// ===== TTS 合成 =====
function synthesizeEdgeTts(script, dateStr, tmpDir) {
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
  return segmentFiles;
}

function synthesizeCosyVoice(script, dateStr, tmpDir) {
  const scriptFile = join(tmpDir, 'dialogue.txt');
  const mappingFile = join(tmpDir, 'mapping.json');

  // 写对话文件，edge-tts voice name → CosyVoice instruct2 描述
  const lines = script.map((l, i) => {
    const voiceDesc = l.voice === TTS_CONFIG.maleVoice ? TTS_CONFIG.cosyVoiceMale : TTS_CONFIG.cosyVoiceFemale;
    return `${i}|${voiceDesc}|${l.text}`;
  }).join('\n');
  writeFileSync(scriptFile, lines, 'utf-8');
  writeFileSync(mappingFile, JSON.stringify(script.map((l, i) => ({ i, voice: l.voice, speaker: l.speaker }))), 'utf-8');

  console.log('调用 CosyVoice 2 批量合成...');
  try {
    execSync(
      `${getPython()} scripts/tts-cosyvoice.py --input "${scriptFile}" --output "${tmpDir}"`,
      { stdio: 'inherit', timeout: 1800000 }
    );
  } catch (err) {
    console.error('CosyVoice 合成失败:', err.message);
    return [];
  }

  const segmentFiles = [];
  for (let i = 0; i < script.length; i++) {
    const segFile = join(tmpDir, `${String(i + 1).padStart(3, '0')}.mp3`);
    if (existsSync(segFile)) {
      segmentFiles.push(segFile);
    }
  }
  return segmentFiles;
}

// ===== 主流程 =====
async function main() {
  console.log('=== 语音播客生成 ===');

  const deps = checkDeps();
  console.log(`环境: edge-tts=${deps.hasEdgeTts}, cosyvoice=${deps.hasCosyVoice}, ffmpeg=${deps.hasFfmpeg}`);

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

  // 用 LLM 生成对话脚本
  let script;
  try {
    script = await generateConversation(briefing, dateChinese);
    console.log(`LLM 对话脚本: ${script.length} 句`);
  } catch (err) {
    console.error('LLM 对话生成失败，使用降级方案:', err.message);
    script = buildFallbackConversation(briefing, dateChinese);
    console.log(`降级对话脚本: ${script.length} 句`);
  }

  if (script.length < 10) {
    console.error('对话脚本过短，退出');
    process.exit(1);
  }

  // 保存对话稿
  const scriptsDir = join(__dirname, '..', 'public', 'scripts');
  if (!existsSync(scriptsDir)) mkdirSync(scriptsDir, { recursive: true });
  writeFileSync(join(scriptsDir, `${dateStr}-dialogue.txt`), script.map(l => `【${l.speaker}】${l.text}`).join('\n\n'), 'utf-8');
  console.log('✓ 对话稿已保存');

  // 选择 TTS 引擎
  const useCosyVoice = deps.hasCosyVoice;
  if (!useCosyVoice && !deps.hasEdgeTts) {
    console.log('\n⚠ 缺少 TTS 引擎，跳过音频生成');
    return;
  }

  // 生成音频
  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
  const tmpDir = join(AUDIO_DIR, 'tmp_' + dateStr);
  mkdirSync(tmpDir, { recursive: true });

  const outputFile = join(AUDIO_DIR, `${dateStr}.mp3`);
  if (existsSync(outputFile)) {
    execSync(`rm -f "${outputFile}"`, { stdio: 'pipe' });
  }

  console.log(`使用 ${useCosyVoice ? 'CosyVoice 2' : 'edge-tts'} 合成 ${script.length} 个片段...`);
  const segmentFiles = useCosyVoice
    ? synthesizeCosyVoice(script, dateStr, tmpDir)
    : synthesizeEdgeTts(script, dateStr, tmpDir);

  if (segmentFiles.length === 0) {
    console.error('没有成功生成任何片段');
    return;
  }

  // ffmpeg 拼接
  const concatFile = join(tmpDir, 'concat.txt');
  writeFileSync(concatFile, segmentFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'), 'utf-8');

  console.log(`拼接 ${segmentFiles.length}/${script.length} 个片段...`);
  const ffmpeg = join('C:', 'Users', '25881', 'miniforge3', 'envs', 'cosyvoice', 'Library', 'bin', 'ffmpeg.exe');
  const ffmpegBin = existsSync(ffmpeg) ? ffmpeg : 'ffmpeg';
  execSync(`"${ffmpegBin}" -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}" -y`, {
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
