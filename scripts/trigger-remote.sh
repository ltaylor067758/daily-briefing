#!/usr/bin/env bash
# trigger-remote.sh — 通过 GitHub API 触发 workflow_dispatch
# 用法: bash scripts/trigger-remote.sh
# 也可挂到 cron-job.org 等外部定时服务上

set -euo pipefail

TOKEN="${GH_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  echo "错误: 请设置 GH_TOKEN 环境变量"
  echo "用法: GH_TOKEN=ghp_xxx bash scripts/trigger-remote.sh"
  exit 1
fi

REPO="ltaylor067758/daily-briefing"
WORKFLOW="daily-build.yml"

RESP=$(curl -s -o /dev/null -w '%{http_code}' \
  -X POST \
  -H "Authorization: token $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches" \
  -d '{"ref":"main"}')

if [ "$RESP" = "204" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 工作流已触发 (HTTP $RESP)"
  exit 0
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 触发失败: HTTP $RESP"
  exit 1
fi
