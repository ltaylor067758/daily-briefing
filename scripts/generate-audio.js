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
  let hasEdgeTts = false;
  let hasFfmpeg = false;

  try {
    execSync('edge-tts --version 2>nul || python -m edge_tts --version 2>nul', { stdio: 'pipe' });
    hasEdgeTts = true;
  } catch { /* no edge-tts */ }

  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    hasFfmpeg = true;
  } catch { /* no ffmpeg */ }

  return { hasEdgeTts, hasFfmpeg };
}

function extractNewsItems(mdContent) {
  // 从简报 Markdown 提取纯文本播客稿
  const lines = mdContent.split('\n');
  let script = '';
  let currentSection = '';

  const d = new Date();
  const dateChinese = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

  // 开场
  script += `各位好，今天是${dateChinese}，欢迎收听每日简报语音播客。\n\n`;

  for (const line of lines) {
    // 版块标题
    if (line.startsWith('## ')) {
      currentSection = line.replace('## ', '').trim();
      script += `接下来是${currentSection}。\n\n`;
      continue;
    }

    // 新闻条目: "1. **[title]** — summary...[阅读原文](url)" 或 "1. **title** — summary..."
    const itemMatch = line.match(/^\d+\.\s*\*\*\[?(.+?)\]?\*\*\s*[—\-]\s*(.+)/);
    if (itemMatch) {
      const title = itemMatch[1].trim();
      let summary = itemMatch[2].trim();
      // 去掉 [阅读原文](url) 部分
      summary = summary.replace(/\.{2,}\[阅读原文\]\([^)]+\)/, '。').replace(/\[阅读原文\]\([^)]+\)/g, '');
      script += `${title}。${summary}\n\n`;
      continue;
    }

    // 今日金句
    if (line.match(/^>\s*\*\*今日金句/)) {
      const qMatch = line.match(/>\s*\*\*今日金句\*\*[：:]\s*(.+)/);
      if (qMatch) {
        script += `最后是今天的金句。${qMatch[1].trim()}\n\n`;
      }
      continue;
    }
  }

  // 结束语
  script += `以上就是今天的全部内容。每天进步一点点，我们明天见。感谢收听，再会。`;

  return script;
}

async function main() {
  console.log('=== 语音播客生成 ===');

  const deps = checkDeps();
  console.log(`环境: edge-tts=${deps.hasEdgeTts}, ffmpeg=${deps.hasFfmpeg}`);

  if (!deps.hasEdgeTts) {
    console.log('\n⚠ 缺少 edge-tts，跳过音频生成');
    console.log('GitHub Actions 上将自动生成音频');
    return;
  }

  const dateStr = getTodayDate();
  const briefingFile = join(CONTENT_DIR, `${dateStr}.md`);

  if (!existsSync(briefingFile)) {
    console.error(`找不到简报文件: ${briefingFile}`);
    process.exit(1);
  }

  const mdContent = readFileSync(briefingFile, 'utf-8');
  const scriptText = extractNewsItems(mdContent);
  console.log(`对话稿: ${scriptText.length} 字符`);

  // 保存文本稿
  const scriptsDir = join(__dirname, '..', 'public', 'scripts');
  if (!existsSync(scriptsDir)) {
    mkdirSync(scriptsDir, { recursive: true });
  }
  const scriptTextFile = join(scriptsDir, `${dateStr}-dialogue.txt`);
  writeFileSync(scriptTextFile, scriptText, 'utf-8');
  console.log(`✓ 对话稿已保存`);

  // 生成音频: 纯文本 + 单音色（女声），避免SSML/多音色兼容性问题
  if (!existsSync(AUDIO_DIR)) {
    mkdirSync(AUDIO_DIR, { recursive: true });
  }

  const outputFile = join(AUDIO_DIR, `${dateStr}.mp3`);

  // edge-tts 单次生成，不用SSML，避免编码错乱
  try {
    console.log('生成音频中...');
    execSync(
      `edge-tts --voice ${TTS_CONFIG.femaleVoice} --rate=${TTS_CONFIG.rate} --text "${scriptText.replace(/"/g, '\\"').replace(/\n/g, ' ')}" --write-media "${outputFile}"`,
      { stdio: 'pipe', timeout: 120000 }
    );
    console.log(`✓ 已生成 ${outputFile}`);
  } catch (err) {
    console.error('音频生成失败:', err.message);
    console.log('站点仍可正常构建（无音频）');
  }

  console.log('=== 音频处理完成 ===');
}

main().catch(err => {
  console.error('音频生成出错:', err);
  process.exit(1);
});
