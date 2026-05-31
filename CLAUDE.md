# daily-briefing — Claude Code 工作规则

## 项目概述
每日早上9点（UTC+8）自动更新的新闻简报网站 + 男女对话播客。
- 本地: `C:\Users\25881\daily-briefing`
- 网站: https://ltaylor067758.github.io/daily-briefing/
- 仓库: https://github.com/ltaylor067758/daily-briefing
- 技术栈: Astro SSG + GitHub Pages + edge-tts + ffmpeg + DeepSeek API

## 核心工作流规则

### 自检标准（最重要）
**"跑通了"不等于"做对了"。** 每次改动必须验证结果：
- RSS 抓取: 检查三版块各≥2条，国内版块无国外新闻
- AI 摘要: 每条 ≥30 字，中文输出，无英文残留
- 音频: 文件 >500KB，时长 >3 分钟，edge-tts 自检通过
- 页面: `npm run build` 无报错，Playwright 打开截图确认三列可见
- 部署: Playwright 打开线上 URL，确认是今天日期和内容
- 改完必须 diff/grep 确认改动真的在文件里，再汇报

### 解决问题流程
1. 先做根因分析，搞清楚"为什么坏"，再动手
2. 如果有简单方案和复杂方案，先提简单方案给用户选
3. 同一问题失败 2 次，停止盲改，重新分析根因
4. 动手前向用户确认方向和方案
5. 改完一个验证一个，确认生效再改下一个

### 关键文件
- `src/pages/index.astro` — 首页，内部手动解析 markdown
- `src/components/NewsCard.astro` — 新闻卡片组件
- `src/styles/global.css` — 所有样式
- `scripts/generate-audio.js` — 播客对话生成 + TTS 调用
- `scripts/fetch-rss.js` — RSS 抓取
- `scripts/ai-summarize.js` — AI 摘要
- `scripts/push-via-api.js` — GitHub API 推送
- `.github/workflows/daily-build.yml` — CI/CD

### 已知技术陷阱
- edge-tts v7.2.8: `Communicate(ssml, voice)` 用位置参数，不用关键字
- SSML `<mstts:express-as style="chat">` 在 `<speak><voice>` 内
- JS ESM: `<` + `!--` 连续出现在源码中会报错
- `--rate=-5%` 用等号语法，否则 argparse 把 `-5%` 当 flag
- 音频用 `execSync` + `--write-media`，不用 `save()`

## 设计规范
- 极客终端风暗色主题
- 字体: JetBrains Mono(代码) + Noto Sans SC(正文)
- 配色: 暗底 #090c12 + 暖橙 accent #f07050 + 三色分类条(红/蓝/绿)
- 灵感: 终端命令行的简洁、功能性、无装饰
- 每项设计改动前先加载 frontend-design 或 design-taste-frontend 技能

## 推送前检查（每次 push 前执行）
1. `/vibe-guard --quick` 安全自检
2. `npm run build` 确认构建成功
3. Playwright 打开 localhost 确认页面正常
