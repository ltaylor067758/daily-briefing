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
    execSync('edge-tts --version 2>/dev/null || python -m edge_tts --version 2>/dev/null', { stdio: 'pipe' });
    hasEdgeTts = true;
  } catch { /* no edge-tts */ }

  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    hasFfmpeg = true;
  } catch { /* no ffmpeg */ }

  return { hasEdgeTts, hasFfmpeg };
}

function buildDialogue(mdContent, dateChinese) {
  const lines = mdContent.split('\n');
  let script = []; // [{speaker:'男'|'女', voice: string, text: string}]

  function add(speaker, voice, text) {
    script.push({ speaker, voice, text });
  }

  const M = '男';
  const F = '女';
  const maleVoice = TTS_CONFIG.maleVoice;
  const femaleVoice = TTS_CONFIG.femaleVoice;

  // 开场
  add(M, maleVoice, `各位好，今天是${dateChinese}，欢迎收听每日简报语音播客。`);
  add(F, femaleVoice, `我是小晓。`);
  add(M, maleVoice, `我是云希。今天的简报涵盖了国内要闻、国际动态和AI科技圈的最新消息，让我们一起看看今天发生了什么。`);

  let turn = 0; // 0=女, 1=男
  let sectionIndex = 0;

  for (const line of lines) {
    // 版块标题
    if (line.startsWith('## ')) {
      const sectionTitle = line.replace('## ', '').trim();
      add(F, femaleVoice, `接下来是${sectionTitle}。`);
      turn = 0;
      sectionIndex++;
      continue;
    }

    // 新闻条目
    const itemMatch = line.match(/^\d+\.\s*\*\*\[?(.+?)\]?\*\*\s*[—\-]\s*(.+)/);
    if (itemMatch) {
      const title = itemMatch[1].trim();
      let summary = itemMatch[2].trim();
      summary = summary.replace(/\.{2,}\[阅读原文\]\([^)]+\)/, '。').replace(/\[阅读原文\]\([^)]+\)/g, '');

      const speaker = turn % 2 === 0 ? F : M;
      const voice = turn % 2 === 0 ? femaleVoice : maleVoice;
      add(speaker, voice, `${title}。${summary}`);

      // 男女交替互动
      if (turn % 2 === 1 && turn > 0) {
        // 男方说完后，女方简短回应
        // 不每句都回应，隔一句回应
      }
      turn++;
      continue;
    }

    // 金句
    if (line.match(/^>\s*\*\*今日金句/)) {
      const qMatch = line.match(/>\s*\*\*今日金句\*\*[：:]\s*(.+)/);
      if (qMatch) {
        add(F, femaleVoice, '最后是今天的金句。');
        add(M, maleVoice, qMatch[1].trim());
      }
      continue;
    }
  }

  // 结束语
  add(M, maleVoice, '以上就是今天的全部内容。');
  add(F, femaleVoice, '每天进步一点点，我们明天见。');
  add(M, maleVoice, '感谢收听，再会。');

  return script;
}

function formatDialogueText(script) {
  return script.map(line =>
    `【${line.speaker}】${line.text}`
  ).join('\n\n');
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

  const script = buildDialogue(mdContent, dateChinese);
  console.log(`对话脚本: ${script.length} 句`);

  // 保存对话稿
  const scriptsDir = join(__dirname, '..', 'public', 'scripts');
  if (!existsSync(scriptsDir)) {
    mkdirSync(scriptsDir, { recursive: true });
  }
  writeFileSync(join(scriptsDir, `${dateStr}-dialogue.txt`), formatDialogueText(script), 'utf-8');
  console.log('✓ 对话稿已保存');

  if (!deps.hasEdgeTts) {
    console.log('\n⚠ 缺少 edge-tts，跳过音频生成');
    return;
  }

  if (!existsSync(AUDIO_DIR)) {
    mkdirSync(AUDIO_DIR, { recursive: true });
  }

  // 纯文本逐句生成音频（不用SSML），再用ffmpeg拼接
  const tmpDir = join(AUDIO_DIR, 'tmp_' + dateStr);
  mkdirSync(tmpDir, { recursive: true });

  console.log(`生成 ${script.length} 个音频片段...`);
  const segmentFiles = [];

  for (let i = 0; i < script.length; i++) {
    const line = script[i];
    const segFile = join(tmpDir, `${String(i + 1).padStart(3, '0')}.mp3`);
    // 把文本中的特殊字符转义
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
    process.exit(1);
  }

  // ffmpeg 拼接
  const concatFile = join(tmpDir, 'concat.txt');
  const concatContent = segmentFiles
    .map(f => `file '${f.replace(/\\/g, '/')}'`)
    .join('\n');
  writeFileSync(concatFile, concatContent, 'utf-8');

  const outputFile = join(AUDIO_DIR, `${dateStr}.mp3`);
  console.log('拼接音频...');
  execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}" -y`, {
    stdio: 'pipe',
    timeout: 120000,
  });

  // 清理临时文件
  execSync(`rm -rf "${tmpDir}"`, { stdio: 'pipe' });

  console.log(`✓ 已生成 ${outputFile}`);
  console.log('=== 音频处理完成 ===');
}

main().catch(err => {
  console.error('音频生成出错:', err);
  // 不 exit 1，允许站点继续构建
  console.log('站点仍可正常构建（无音频）');
});
