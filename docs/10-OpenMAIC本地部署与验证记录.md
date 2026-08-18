# OpenMAIC 本地部署与验证记录

更新：2026-08-14

## 当前结论

OpenMAIC v0.3.2 已进入课程项目并能在本机运行。课程网站的“教学平台”页面已经改为嵌入 OpenMAIC。阿里云百炼模型由服务端配置，密钥从 macOS Keychain 注入，没有写入网页、代码或 Git。

这次完成的是开源版基线部署。官方托管站 `open.maic.chat` 另有登录、公开课程“发现”页、浏览量和互动数据；这些服务不在 v0.3.2 开源仓库中，不能靠部署仓库直接得到。课程账号、作品广场和管理后台仍按第三阶段自建。

## 版本与位置

| 项目 | 当前值 |
|---|---|
| 上游仓库 | `https://github.com/THU-MAIC/OpenMAIC` |
| 版本 | `v0.3.2` |
| 提交 | `673af150c03da94e86ccccbd4353485f253aa203` |
| 许可证 | MIT |
| 本地目录 | `apps/openmaic` |
| 本地分支 | `codex/course-openmaic-local` |
| OpenMAIC 地址 | `http://127.0.0.1:3100/` |
| 课程网站地址 | `http://127.0.0.1:8765/` |
| 教学平台入口 | `http://127.0.0.1:8765/teaching.html` |

## 模型配置

当前使用阿里云百炼中国区 OpenAI 兼容接口：

```text
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DEFAULT_MODEL=qwen:qwen3.7-plus
```

本地界面已开启开源仓库提供的 Pro 编辑器、视频导出入口和 PPTX 导入入口。视频导出按钮可见不代表渲染服务已部署；这一点在下方单独列出。

启动脚本从 Keychain 服务 `ai-org-course-dashscope` 读取凭据，再导出为进程环境变量 `QWEN_API_KEY`。`.env.local` 只保存端点、模型名和允许嵌入的本地课程站地址。

模型接口验证结果：

- `/models` 返回 HTTP 200，共发现 237 个模型；
- `qwen3.7-plus`、`qwen3.7-max`、`qwen3.6-plus` 和 `qwen3.5-plus` 可见；
- OpenMAIC 自带 `/api/verify-model` 返回 `Connection successful` 和 `OK`；
- `/api/server-providers` 只向浏览器返回 `qwen`、模型列表和服务端已配置状态，不返回密钥。

用户在对话里贴出的密钥已经暴露，应在百炼控制台撤销并新建。新密钥仍应放入 Keychain，不要写入 `.env.local`。

## 已验证项目

| 项目 | 结果 | 说明 |
|---|---|---|
| 仓库与依赖 | 通过 | 9 个 workspace 项目安装完成；OpenMAIC 本地目录约 2.5 GB，其中 `node_modules` 约 2.3 GB |
| 官方首页 | 通过 | `/` 返回 200，页面标题为 OpenMAIC |
| 健康检查 | 通过 | `/api/health` 返回 `success: true` |
| 模型连通 | 通过 | 百炼 `qwen3.7-plus` 最小调用成功 |
| 课程网站嵌入 | 通过 | OpenMAIC 允许 `127.0.0.1:8765` 与 `localhost:8765` 作为 frame ancestor |
| 桌面端 | 通过 | 1440 × 1000 浏览器实测，无横向溢出或 iframe 拒绝 |
| 移动端 | 通过 | 390 × 844 浏览器实测，课程导航与 OpenMAIC 主界面可用 |
| 新版规划 HTML | 通过 | 离线结构检查通过，交互清单可用 |
| 课堂生成 | 通过 | “有限理性：组织理论视角”已生成 6 个场景并持久化，重启后仍可打开 |
| 生成课堂播放页 | 通过 | `http://127.0.0.1:3100/classroom/zbmZvlh65w` 返回 200，浏览器可见课件、动作和智能体讲解 |
| 单元测试 | 通过 | Node 22 下 431 个文件、4503 项测试通过；3 个文件、53 项测试跳过；无失败 |
| 浏览器 E2E | 通过 | 27 项通过，覆盖生成流程、课堂切换、Pro 编辑、测验、播放恢复、托管模型配置和视频缩略图 |
| 生产构建 | 通过 | Next.js 优化构建成功，43 个静态与动态路由完成检查 |

## 启动方法

双击或在终端运行：

```bash
./线上教学课程平台的智能体建设/apps/course-platform-prototype/start-learning-platform.command
```

脚本会检查 3100 和 8765 端口，启动缺失的服务，并打开课程网站的教学平台页面。关闭启动脚本所在的终端窗口，会停止由该脚本启动的本地服务。

也可以只启动 OpenMAIC：

```bash
./线上教学课程平台的智能体建设/infra/scripts/start-openmaic-local.sh
```

## 本地兼容改动

课程项目所在路径较长且含中文。Next.js 16.1.2 的 Turbopack 在没有固定项目根目录时，会在生成模块标识时切断 UTF-8 汉字并崩溃。`next.config.ts` 已把 `outputFileTracingRoot` 和 `turbopack.root` 固定到 OpenMAIC 仓库。该改动不改变课堂业务逻辑。

同一配置还把 `pg` 与 `pg-connection-string` 列为服务端外部包，为后续 PostgreSQL 持久化保留 Node 运行时边界。

OpenMAIC 的 `.nvmrc` 指定 Node 22。课程工作区默认提供 Node 25，运行测试时会造成浏览器本地存储测试超时和 KV 读写警告。启动脚本已自动切换到 Node 22；Node 22 下的全量测试没有失败。

## 目前未通过或尚未配置

1. **托管站账号与“发现”页**：官方线上站有这些功能，开源仓库没有相应服务。第三阶段自建。
2. **网页搜索**：未配置搜索服务，健康检查显示 `webSearch: false`。
3. **图片和视频生成**：未配置媒体模型，健康检查显示 `imageGeneration: false`、`videoGeneration: false`。
4. **服务端 TTS**：未配置，健康检查显示 `tts: false`。浏览器端能力与服务端语音要分开验收。
5. **MP4 导出**：需要另启 Chromium + FFmpeg 渲染服务，尚未部署。
6. **服务器持久化**：当前没有 PostgreSQL；课堂和设置仍以浏览器存储为主。
7. **健康接口版本号**：仓库版本为 v0.3.2，但 `/api/health` 返回 `0.1.0`。功能不受影响，版本展示应在上线前修正。

## 下一轮开发入口

先完成开源基线的课堂生成、播放、编辑、测验、PBL、导入与导出核验。基线通过后再进入课程改造：课程周次与文献关联、生成视频下载、学习活动记录、学生材料分区、教师审核与作品发布。账号、数据库、后台分析、服务器封装和小程序同步放在第三阶段。
