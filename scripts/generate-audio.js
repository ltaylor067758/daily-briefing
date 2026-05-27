import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { TTS_CONFIG } from './lib/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = join(__dirname, '..', 'src', 'content', 'briefings');
const AUDIO_DIR = join(__dirname, '..', 'public', 'audio');
const SCRIPTS_DIR = join(__dirname, '..', 'public', 'scripts');

function getTodayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function checkDeps() {
  let hasPython = false;
  let hasEdgeTts = false;
  let hasFfmpeg = false;

  try {
    execSync('python3 --version 2>nul || python --version 2>nul', { stdio: 'pipe' });
    hasPython = true;
  } catch { /* no python */ }

  try {
    execSync('edge-tts --version 2>nul || python -m edge_tts --version 2>nul', { stdio: 'pipe' });
    hasEdgeTts = true;
  } catch { /* no edge-tts */ }

  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    hasFfmpeg = true;
  } catch { /* no ffmpeg */ }

  return { hasPython, hasEdgeTts, hasFfmpeg };
}

function parseDialogueScript(mdContent) {
  // 从简报 Markdown 提取新闻内容，生成对话脚本
  const lines = mdContent.split('\n');
  const sections = [];
  let currentSection = null;
  let currentItems = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentSection && currentItems.length > 0) {
        sections.push({ title: currentSection, items: currentItems });
      }
      currentSection = line.replace('## ', '').trim();
      currentItems = [];
    } else if (line.match(/^\d+\.\s*\*\*\[/)) {
      // 匹配 "1. **[标题]** — 摘要...[阅读原文](url)"
      const match = line.match(/^\d+\.\s*\*\*\[(.+?)\]\*\*\s*—\s*(.+?)(?:\[阅读原文\]|$)/);
      if (match) {
        currentItems.push({ title: match[1].trim(), summary: match[2].trim() });
      }
    } else if (line.startsWith('> **今日金句')) {
      const quoteMatch = line.match(/>\s*\*\*今日金句\*\*[：:]\s*(.+)/);
      if (quoteMatch) {
        sections.push({ title: '今日金句', items: [], quote: quoteMatch[1].trim() });
      }
    }
  }

  if (currentSection && currentItems.length > 0) {
    sections.push({ title: currentSection, items: currentItems });
  }

  return sections;
}

function buildDialogue(sections, dateChinese) {
  const M = 'Yunxi';  // 男
  const F = 'Xiaoxiao'; // 女

  let script = [];
  let lineNum = 0;

  function add(speaker, text) {
    script.push({ id: ++lineNum, speaker: speaker === M ? '男' : '女', voice: speaker === M ? TTS_CONFIG.maleVoice : TTS_CONFIG.femaleVoice, text });
  }

  // 开场
  add(M, `各位好，今天是${dateChinese}，欢迎收听每日简报语音播客。`);
  add(F, `我是小晓。`);
  add(M, `我是云希。今天的简报涵盖了国内要闻、国际动态和AI科技圈的最新消息，让我们一起看看今天发生了什么。`);

  // 遍历每个版块
  for (const section of sections) {
    if (section.quote) {
      // 今日金句
      add(F, `最后是今天的金句。`);
      add(M, section.quote);
      continue;
    }

    const label = section.title.replace(/[🇨🇳🇨🇳🌍🤖\s]/g, '').replace(/[emoji]/g, '');
    add(F, `接下来是${section.title}。`);

    for (let i = 0; i < section.items.length; i++) {
      const item = section.items[i];
      const cleanedSummary = item.summary.replace(/\[阅读原文\]\([^)]+\)/g, '').replace(/\*\*/g, '').trim();

      if (i % 2 === 0) {
        add(F, `${item.title}。${cleanedSummary}`);
      } else {
        add(M, `${item.title}。${cleanedSummary}`);
        if (i < section.items.length - 1) {
          add(F, `嗯，这条新闻确实值得关注。`);
        }
      }
    }
  }

  // 结束语
  add(M, `以上就是今天的全部内容。`);
  add(F, `每天进步一点点，我们明天见。`);
  add(M, `感谢收听，再会。`);

  return script;
}

function formatDialogueText(script) {
  return script.map(line =>
    `【${line.speaker}】${line.text}`
  ).join('\n\n');
}

async function generateAudioWithPython(script, dateStr) {
  const segmentsDir = join(AUDIO_DIR, 'segments', dateStr);
  mkdirSync(segmentsDir, { recursive: true });

  // Generate SSML files per line
  const ssmlFiles = [];
  for (const line of script) {
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
  <voice name="${line.voice}">
    <prosody rate="${TTS_CONFIG.rate}">
      ${line.text}
    </prosody>
  </voice>
</speak>`;

    const ssmlFile = join(segmentsDir, `${String(line.id).padStart(3, '0')}.ssml`);
    const mp3File = join(segmentsDir, `${String(line.id).padStart(3, '0')}.mp3`);

    writeFileSync(ssmlFile, ssml, 'utf-8');
    ssmlFiles.push({ ssmlFile, mp3File, id: line.id });
  }

  console.log(`生成 ${ssmlFiles.length} 个音频片段...`);

  // Generate audio for each segment using edge-tts
  for (const { ssmlFile, mp3File, id } of ssmlFiles) {
    try {
      execSync(`edge-tts --file "${ssmlFile}" --write-media "${mp3File}"`, {
        stdio: 'pipe',
        timeout: 30000,
      });
      console.log(`  [${id}/${ssmlFiles.length}] ✓`);
    } catch (err) {
      console.error(`  [${id}/${ssmlFiles.length}] ✗: ${err.message}`);
    }
  }

  // Concatenate with ffmpeg
  const concatFile = join(segmentsDir, 'concat.txt');
  const concatContent = ssmlFiles
    .filter(({ mp3File }) => existsSync(mp3File))
    .map(({ mp3File }) => `file '${mp3File.replace(/\\/g, '/')}'`)
    .join('\n');
  writeFileSync(concatFile, concatContent, 'utf-8');

  const outputFile = join(AUDIO_DIR, `${dateStr}.mp3`);
  console.log('拼接音频...');
  execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}" -y`, {
    stdio: 'pipe',
    timeout: 60000,
  });

  // Clean up segments
  execSync(`rm -rf "${segmentsDir}"`, { stdio: 'pipe' });

  console.log(`✓ 已生成 ${outputFile}`);
  return outputFile;
}

async function main() {
  console.log('=== 语音播客生成 ===');

  const deps = checkDeps();
  console.log(`环境: Python=${deps.hasPython}, edge-tts=${deps.hasEdgeTts}, ffmpeg=${deps.hasFfmpeg}`);

  const dateStr = getTodayDate();
  const briefingFile = join(CONTENT_DIR, `${dateStr}.md`);

  if (!existsSync(briefingFile)) {
    console.error(`找不到简报文件: ${briefingFile}`);
    process.exit(1);
  }

  const mdContent = readFileSync(briefingFile, 'utf-8');
  const sections = parseDialogueScript(mdContent);
  console.log(`解析到 ${sections.length} 个版块`);

  const d = new Date();
  const dateChinese = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

  const script = buildDialogue(sections, dateChinese);
  console.log(`对话脚本: ${script.length} 句`);

  // 保存对话脚本文本
  if (!existsSync(SCRIPTS_DIR)) {
    mkdirSync(SCRIPTS_DIR, { recursive: true });
  }
  const scriptTextFile = join(SCRIPTS_DIR, `${dateStr}-dialogue.txt`);
  writeFileSync(scriptTextFile, formatDialogueText(script), 'utf-8');
  console.log(`✓ 对话脚本已保存到 ${scriptTextFile}`);

  // 生成音频（需要 edge-tts + ffmpeg）
  if (deps.hasEdgeTts && deps.hasFfmpeg) {
    if (!existsSync(AUDIO_DIR)) {
      mkdirSync(AUDIO_DIR, { recursive: true });
    }
    try {
      await generateAudioWithPython(script, dateStr);
    } catch (err) {
      console.error('音频生成失败:', err.message);
      console.log('站点仍可正常构建（无音频）');
    }
  } else {
    console.log('\n⚠ 本地缺少 edge-tts/ffmpeg，跳过音频生成');
    console.log('GitHub Actions 上将自动生成完整音频');
  }

  console.log('=== 音频处理完成 ===');
}

main().catch(err => {
  console.error('音频生成出错:', err);
  process.exit(1);
});
