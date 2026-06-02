import { readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const OWNER = 'ltaylor067758';
const REPO = 'daily-briefing';
const TOKEN = process.env.GH_TOKEN;
const BRANCH = 'main';

if (!TOKEN) {
  console.error('请设置 GH_TOKEN: export GH_TOKEN=ghp_xxx 或在前面加上 GH_TOKEN=ghp_xxx node ...');
  process.exit(1);
}

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const headers = {
  'Authorization': `token ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

// 根据命令行参数或默认推送以下文件
const FILES_TO_PUSH = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [
    '.github/workflows/daily-build.yml',
    'scripts/generate-audio.js',
    'scripts/lib/config.js',
    'scripts/push-via-api.js',
  ];

const BINARY_EXTS = ['.mp3', '.wav', '.mp4', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.woff', '.woff2', '.ttf'];

function isBinary(filePath) {
  const ext = filePath.toLowerCase().split('.').pop();
  return BINARY_EXTS.includes(`.${ext}`);
}

async function createBlob(filePath) {
  const fullPath = join(REPO_ROOT, filePath);
  const ext = filePath.toLowerCase().split('.').pop();

  if (isBinary(filePath)) {
    // 二进制文件：base64 编码
    const content = readFileSync(fullPath);
    const base64Content = content.toString('base64');
    console.log(`  Creating blob for ${filePath} (binary, ${content.length} bytes)...`);
    const resp = await fetch(`${API}/git/blobs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: base64Content, encoding: 'base64' }),
    });
    if (!resp.ok) {
      console.error(`  Failed: ${resp.status}`);
      const errBody = await resp.text();
      console.error(`  ${errBody.substring(0, 200)}`);
      return null;
    }
    return (await resp.json()).sha;
  } else {
    // 文本文件：UTF-8
    const content = readFileSync(fullPath, 'utf-8');
    console.log(`  Creating blob for ${filePath} (${content.length} chars)...`);
    const resp = await fetch(`${API}/git/blobs`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    });
    if (!resp.ok) {
      console.error(`  Failed: ${resp.status}`);
      const errBody = await resp.text();
      console.error(`  ${errBody.substring(0, 200)}`);
      return null;
    }
    return (await resp.json()).sha;
  }
}

async function main() {
  // 1. Get current HEAD
  console.log('Getting current HEAD...');
  const refResp = await fetch(`${API}/git/refs/heads/${BRANCH}`, { headers });
  if (!refResp.ok) { console.error('Failed to get ref:', refResp.status); return; }
  const refData = await refResp.json();
  const baseCommitSha = refData.object.sha;
  console.log(`Base commit: ${baseCommitSha}`);

  // 2. Get base tree
  const commitResp = await fetch(`${API}/git/commits/${baseCommitSha}`, { headers });
  const commitData = await commitResp.json();
  const baseTreeSha = commitData.tree.sha;
  console.log(`Base tree: ${baseTreeSha}`);

  // 3. Create blobs
  const treeItems = [];
  for (const filePath of FILES_TO_PUSH) {
    const sha = await createBlob(filePath);
    if (sha) {
      treeItems.push({ path: filePath.replace(/\\/g, '/'), mode: '100644', type: 'blob', sha });
    }
  }

  if (treeItems.length === 0) {
    console.error('No blobs created');
    return;
  }

  // 4. Create tree
  console.log('Creating tree...');
  const treeResp = await fetch(`${API}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  });
  if (!treeResp.ok) {
    console.error('Failed:', treeResp.status);
    const errBody = await treeResp.text();
    console.error(errBody);
    return;
  }
  const treeData = await treeResp.json();
  console.log(`New tree: ${treeData.sha}`);

  // 5. Create commit
  const commitMsg = process.env.COMMIT_MSG || 'chore: update files via API';
  console.log(`Creating commit: ${commitMsg}`);
  const createCommitResp = await fetch(`${API}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ message: commitMsg, tree: treeData.sha, parents: [baseCommitSha] }),
  });
  if (!createCommitResp.ok) {
    console.error('Failed:', createCommitResp.status);
    const errBody = await createCommitResp.text();
    console.error(errBody);
    return;
  }
  const newCommit = await createCommitResp.json();
  console.log(`New commit: ${newCommit.sha}`);

  // 6. Update ref
  console.log('Updating ref...');
  const updateRefResp = await fetch(`${API}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });
  if (!updateRefResp.ok) {
    console.error('Failed:', updateRefResp.status);
    const errBody = await updateRefResp.text();
    console.error(errBody);
    return;
  }
  console.log('✓ Successfully pushed to GitHub!');
}

main().catch(err => console.error('Push failed:', err.message));
