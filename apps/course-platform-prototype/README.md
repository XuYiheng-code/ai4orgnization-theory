# 《人工智能与组织管理》课程站

首页入口：[index.html](index.html)

## 页面

- [首页](index.html)
- [课程大纲](syllabus.html)
- [课程教材](textbooks.html)
- [知识库](knowledge.html)
- [教学平台](teaching.html)
- [关于](about.html)
- [智能阅读器](reader.html)（从知识库进入）

每个栏目都是独立页面。首页只放课程定位、基本问题和三个常用入口，不呈现制作规划或技术汇报。

## 本轮视觉版本

- 以白色和学院深蓝为主，保留课程 Logo 原有的少量橙色；
- 首页及五个栏目页的页面级标题均保持单行；
- 首页 Logo 采用“模块拆分—扫描校准—组合锁定”的 SVG 动画，过程与最终状态共用一套矢量结构；
- 动画支持手动重播，并保留轻微指针视差；
- 顶部导航、教学平台和首页统一使用 `course-logo-v2.svg`，直接双击 HTML 也能显示；
- 动效会遵守系统的“减少动态效果”设置；
- 桌面端与手机端均已通过页面溢出、标题折行、导航与主要交互检查。

## 启动方式

首页和大纲仍可直接双击查看。知识库下载、PDF/Markdown 阅读和 AI 功能需要通过本地服务启动：

```bash
cd apps/course-platform-prototype
python3 server.py
```

打开：

```text
http://127.0.0.1:8765/index.html
```

本机已配置登录后自动启动课程服务。直接双击 `knowledge.html` 或 `reader.html` 时，页面也会自动切换到上述本地服务地址。

### 配置千问

不要把 API Key 写进 HTML、JavaScript 或仓库。本机开发默认从 macOS 钥匙串服务 `ai-org-course-dashscope` 读取；公开部署时使用服务端环境变量：

```bash
export DASHSCOPE_API_KEY="替换为重新生成的 Key"
export QWEN_MODEL="qwen-plus"
python3 server.py
```

`server.py` 通过千问的 OpenAI 兼容接口发送翻译和问答请求。默认每个客户端每分钟最多调用 20 次，可用 `COURSE_AI_RATE_LIMIT` 调整。需要使用业务空间专属地址时，再设置 `DASHSCOPE_BASE_URL`。可通过 `/api/ai-status` 检查配置状态；该接口不会返回 Key。

## 本轮新增

- 收细 Logo 中 AO 字标笔画；
- 四个课程阶段改为“解释组织—技术嵌入—智能重构—公共治理”；
- 16 节课全部增加课程简介；
- 知识库改为动态读取全部资料，当前为 19 项资料、26 个文件；同名 PDF/Markdown 及 HTML 整理版自动合并；
- 阅读器改为原文、译文、AI 对话三栏工作区，翻译按片段调用并在浏览器缓存，AI 支持多轮追问；
- 知识库支持从本机上传 PDF、Markdown、Word 与文本文件；同名文件拒绝覆盖，上传后自动进入索引；
- “关于”页增加于君博教授的官网资料、头像与后续建设计划。

## 内容来源

- 16 周主题：《人工智能与组织管理》16周本科课程教学大纲指南.docx；
- Logo：`brand/assets/course-logo-official.png`（用户确认的正式版本）；
- 文献目录：课程文件夹中的组织学参考文献；
- 教材结构：课程大纲与 AI 素养培训项目的现有规划。

## 当前边界

教学平台的提交记录仍只保存在当前浏览器的 `localStorage`，尚未接入真实账号、数据库和班级权限。知识库会动态读取 `课程的参考文献/` 中的 PDF、Markdown、Word 与文本文件。正式上线前还要逐项确认资料版权与公开范围。

新增文献时可使用本地 Skill：[course-literature-updater](/Users/xuyiheng/.codex/skills/course-literature-updater/SKILL.md)。把文件放入课程文献目录后，该 Skill 会检查重复版本、阅读和下载能力、网站数量与安全路径。

## 验证

```bash
python3 /Users/xuyiheng/.agents/skills/webapp-testing/scripts/with_server.py \
  --server "python3 server.py" --port 8765 -- python3 verify_v5.py
```

验证范围包括 6 个页面、Logo 线宽、4 个课程阶段、16 节课程简介、文献下载、安全路径、Markdown/PDF 阅读、未配置 Key 时的提示、教师资料、后续规划和手机端溢出。

千问真实调用验证（会产生少量模型调用）：

```bash
python3 verify_ai.py
```

验证内容包括钥匙串读取、`qwen-plus` 状态、英译中、首次问答、带历史记录的连续追问，以及阅读器界面的完整问答流程。
