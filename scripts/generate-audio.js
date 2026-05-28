import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { TTS_CONFIG, DIALOGUE_SYSTEM_PROMPT } from './lib/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'src', 'content', 'briefings');
const AUDIO_DIR = join(__dirname, '..', 'public', 'audio');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.deepseek.com/anthropic',
});
const MODEL = process.env.ANTHROPIC_MODEL || 'deepseek-v4-pro';

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

async function generateDialogueWithAI(briefingContent, dateChinese) {
  console.log('调用 AI 生成播客对话...');

  const userPrompt = `以下是今天的新闻简报。请根据系统指令，生成一段自然生动的男女对话播客脚本。

${briefingContent}

今天是${dateChinese}。`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: DIALOGUE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
    temperature: 0.8,
  });

  const content = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('');

  console.log(`AI 对话长度: ${content.length} 字符`);
  return content;
}

function parseDialogue(aiOutput) {
  // AI输出格式: "男：xxx" 或 "女：xxx"，每行一个发言
  const lines = aiOutput.split('\n');
  const script = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(男|女)[：:]\s*(.+)/);
    if (match) {
      const speaker = match[1];
      const text = match[2].trim();
      if (text.length > 0) {
        script.push({
          speaker,
          voice: speaker === '男' ? TTS_CONFIG.maleVoice : TTS_CONFIG.femaleVoice,
          text,
        });
      }
    }
  }

  return script;
}

function fallbackDialogue(mdContent, dateChinese) {
  // Fallback when AI is unavailable: simple alternating reading
  console.log('使用降级播客模式');
  const lines = mdContent.split('\n');
  let script = [];
  let turn = 0;

  script.push({ speaker: '男', voice: TTS_CONFIG.maleVoice, text: `各位好，今天是${dateChinese}，欢迎收听每日简报。` });

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const section = line.replace('## ', '').trim();
      script.push({ speaker: '女', voice: TTS_CONFIG.femaleVoice, text: `下面是${section}。` });
      turn = 0;
      continue;
    }
    const itemMatch = line.match(/^\d+\.\s*\*\*\[?(.+?)\]?\*\*\s*[—\-]\s*(.+)/);
    if (itemMatch) {
      const title = itemMatch[1].trim();
      let summary = itemMatch[2].replace(/\.{2,}\[阅读原文\]\([^)]+\)/, '。').replace(/\[阅读原文\]\([^)]+\)/g, '').trim();
      const voice = turn % 2 === 0 ? TTS_CONFIG.femaleVoice : TTS_CONFIG.maleVoice;
      const speaker = turn % 2 === 0 ? '女' : '男';
      script.push({ speaker, voice, text: `${title}。${summary}` });
      turn++;
      continue;
    }
    if (line.match(/^>\s*\*\*今日金句/)) {
      const qMatch = line.match(/>\s*\*\*今日金句\*\*[：:]\s*(.+)/);
      if (qMatch) {
        script.push({ speaker: '女', voice: TTS_CONFIG.femaleVoice, text: '今天的金句：' });
        script.push({ speaker: '男', voice: TTS_CONFIG.maleVoice, text: qMatch[1].trim() });
      }
    }
  }

  script.push({ speaker: '男', voice: TTS_CONFIG.maleVoice, text: '以上就是今天的全部内容，感谢收听，我们明天见。' });
  return script;
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
  const d = new Date();
  const dateChinese = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

  // Step 1: Generate dialogue (AI or fallback)
  let script;
  try {
    const aiDialogue = await generateDialogueWithAI(mdContent, dateChinese);
    script = parseDialogue(aiDialogue);
    if (script.length < 5) {
      console.log('AI 对话内容不足，使用降级模式');
      script = fallbackDialogue(mdContent, dateChinese);
    }
  } catch (err) {
    console.error('AI 对话生成失败:', err.message);
    script = fallbackDialogue(mdContent, dateChinese);
  }

  console.log(`对话脚本: ${script.length} 句`);

  // Save dialogue text
  const scriptsDir = join(__dirname, '..', 'public', 'scripts');
  if (!existsSync(scriptsDir)) mkdirSync(scriptsDir, { recursive: true });
  const scriptText = script.map(l => `【${l.speaker}】${l.text}`).join('\n\n');
  writeFileSync(join(scriptsDir, `${dateStr}-dialogue.txt`), scriptText, 'utf-8');
  console.log('✓ 对话稿已保存');

  if (!deps.hasEdgeTts) {
    console.log('\n⚠ 缺少 edge-tts，跳过音频生成');
    return;
  }

  // Step 2: Generate audio segments
  if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });
  const tmpDir = join(AUDIO_DIR, 'tmp_' + dateStr);
  mkdirSync(tmpDir, { recursive: true });

  console.log(`生成 ${script.length} 个音频片段...`);
  const segmentFiles = [];

  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const segFile = join(tmpDir, `${String(i + 1).padStart(3, '0')}.mp3`);
    const safeText = line.text.replace(/"/g, '\\"');

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

  // Step 3: Concatenate with ffmpeg
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
