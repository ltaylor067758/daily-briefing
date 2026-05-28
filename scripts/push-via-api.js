import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const OWNER = 'ltaylor067758';
const REPO = 'daily-briefing';
const TOKEN = process.env.GH_TOKEN;
const BRANCH = 'main';

if (!TOKEN) {
  console.error('请设置 GH_TOKEN 环境变量: export GH_TOKEN=ghp_xxx');
  console.error('或在前面加上 GH_TOKEN=ghp_xxx node scripts/push-via-api.js');
  process.exit(1);
}

const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const headers = {
  'Authorization': `token ${TOKEN}`,
  'Content-Type': 'application/json',
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};

// 根据需要修改要推送的文件列表
const FILES_TO_PUSH = [
  'scripts/generate-audio.js',
  'scripts/lib/config.js',
  'src/styles/global.css',
];

async function main() {
  // 1. Get the current HEAD commit SHA
  console.log('Getting current HEAD...');
  const refResp = await fetch(`${API}/git/refs/heads/${BRANCH}`, { headers });
  if (!refResp.ok) { console.error('Failed to get ref:', refResp.status); return; }
  const refData = await refResp.json();
  const baseCommitSha = refData.object.sha;
  console.log(`Base commit: ${baseCommitSha}`);

  // 2. Get the base commit to get its tree SHA
  const commitResp = await fetch(`${API}/git/commits/${baseCommitSha}`, { headers });
  const commitData = await commitResp.json();
  const baseTreeSha = commitData.tree.sha;
  console.log(`Base tree: ${baseTreeSha}`);

  // 3. Create blobs for each file
  const treeItems = [];
  for (const filePath of FILES_TO_PUSH) {
    const fullPath = join(REPO_ROOT, filePath);
    const content = readFileSync(fullPath, 'utf-8');
    console.log(`Creating blob for ${filePath} (${content.length} bytes)...`);
    const blobResp = await fetch(`${API}/git/blobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    });
    if (!blobResp.ok) {
      console.error(`Failed to create blob for ${filePath}:`, blobResp.status);
      continue;
    }
    const blobData = await blobResp.json();
    treeItems.push({
      path: filePath,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    });
    console.log(`  sha: ${blobData.sha}`);
  }

  if (treeItems.length === 0) {
    console.error('No blobs created');
    return;
  }

  // 4. Create a new tree
  console.log('Creating tree...');
  const treeResp = await fetch(`${API}/git/trees`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      base_tree: baseTreeSha,
      tree: treeItems,
    }),
  });
  if (!treeResp.ok) {
    console.error('Failed to create tree:', treeResp.status);
    const errBody = await treeResp.text();
    console.error(errBody);
    return;
  }
  const treeData = await treeResp.json();
  console.log(`New tree: ${treeData.sha}`);

  // 5. Create a commit
  console.log('Creating commit...');
  const commitMsg = 'feat: natural conversation podcast + richer design';
  const createCommitResp = await fetch(`${API}/git/commits`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: commitMsg,
      tree: treeData.sha,
      parents: [baseCommitSha],
    }),
  });
  if (!createCommitResp.ok) {
    console.error('Failed to create commit:', createCommitResp.status);
    const errBody = await createCommitResp.text();
    console.error(errBody);
    return;
  }
  const newCommit = await createCommitResp.json();
  console.log(`New commit: ${newCommit.sha}`);

  // 6. Update the ref
  console.log('Updating ref...');
  const updateRefResp = await fetch(`${API}/git/refs/heads/${BRANCH}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      sha: newCommit.sha,
      force: false,
    }),
  });
  if (!updateRefResp.ok) {
    console.error('Failed to update ref:', updateRefResp.status);
    const errBody = await updateRefResp.text();
    console.error(errBody);
    return;
  }
  console.log('✓ Successfully pushed to GitHub!');
  console.log(`New HEAD: ${newCommit.sha}`);
}

main().catch(err => {
  console.error('Push failed:', err.message);
});
