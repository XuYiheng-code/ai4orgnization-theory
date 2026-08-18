# 课程微信小程序前期骨架

这是《人工智能与组织管理》课程平台的微信原生小程序原型。它可以直接导入微信开发者工具，当前使用演示数据，不连接真实学生数据库，也不会调用正式 AI 服务。

## 现在能看什么

- 问答：默认首页，支持多轮消息、回答来源卡片和未登录提示；
- 问答历史：登录用户可以检索自己的课程对话；
- 学习：承接网站的课程首页、大纲和三条教材线；
- 知识库：按公开知识与班级知识划分入口，并提供条目正文、问题和来源；
- 作业：演示草稿、形成性反馈和版本记录；
- 我的：显示课程身份、问答历史、关于课程和账号数据入口；
- 登录：开发工具中可切换学生、教师演示身份。

演示模式下，作业草稿只存在当前开发设备。正式版本必须把对话、消息、提交版本和教师反馈写入服务端数据库，前端本地存储只能作为缓存或未提交草稿。

## 导入微信开发者工具

1. 打开微信开发者工具，选择“导入项目”。
2. 项目目录选择当前 `course-mini-program` 文件夹。
3. 还没有正式 AppID 时，可以继续使用 `project.config.json` 中的测试配置预览界面。
4. 取得 AppID 后，把 `project.config.json` 的 `appid` 换成正式值。
5. 在 `miniprogram/config/index.js` 中保留 `mockMode: true`，先检查页面和交互。

导入后默认进入“问答”页。底部五个入口分别是问答、学习、知识库、作业和我的。

修改代码后，可以在终端运行：

```bash
node scripts/verify.js
```

脚本会检查页面文件、底部导航、JSON 和 WXML 中常见的结构问题。
它还会读取 `sync-manifest.json`，确认同步清单里的网站文件和小程序页面仍然存在。

## 接入真实服务

后端继续沿用课程平台已经确定的 FastAPI、PostgreSQL + pgvector 和对象存储，不为小程序另建一套业务数据。建议使用同一组 `/v1` 接口：

```text
POST /v1/auth/wechat/login
GET  /v1/courses
GET  /v1/knowledge
POST /v1/conversations
POST /v1/conversations/{id}/messages
GET  /v1/me/conversations
GET  /v1/me/assignments
POST /v1/assignments/{id}/submissions
```

接入步骤：

1. 部署 HTTPS API 域名；
2. 在小程序后台配置 request、uploadFile、downloadFile 和 WebSocket 合法域名；
3. 实现 `POST /v1/auth/wechat/login`，由服务端使用 `code` 换取微信身份，再返回课程平台自己的登录态；
4. 把 `miniprogram/config/index.js` 中的 `apiBaseUrl` 换成正式地址；
5. 将 `mockMode` 改为 `false`；
6. 按 `docs/小程序数据与接口草案.md` 建表并执行跨用户、跨班级权限测试。

`AppSecret`、`session_key` 和模型 API Key 只能放在服务端。不要写进小程序代码、Git 仓库或前端返回值。

## 目前刻意没有做的内容

- 真实微信用户绑定、课程码入班和名单导入；
- RAG 检索、流式输出、模型费用限制和回答反馈；
- 文件上传、对象存储、教师评分和正式成绩确认；
- 小程序隐私授权弹窗、用户协议、注销和数据导出；
- 订阅消息、运营数据和后台管理页面。

这些功能依赖 AppID、主体信息、域名、服务器、隐私规则和课程团队确认。当前骨架为它们保留了页面位置与接口边界，但不会伪装成已经上线。

## 文件位置

```text
course-mini-program/
├── miniprogram/
│   ├── config/           # API 地址和演示开关
│   ├── custom-tab-bar/   # 底部五个入口
│   ├── mock/             # 仅供开发预览的演示数据
│   ├── pages/            # 问答、学习、知识库、作业、我的等页面
│   ├── services/         # 登录与业务接口封装
│   └── utils/            # 按用户隔离的本地草稿存储
├── docs/                 # 产品、数据和微信后台准备清单
└── project.config.json
```

网站有功能变更时，按 [`docs/03-网站与小程序功能同步清单.md`](docs/03-网站与小程序功能同步清单.md) 逐项检查，不在两个前端重复维护课程正文。
