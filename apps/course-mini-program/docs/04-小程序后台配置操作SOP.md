# 小程序微信公众平台后台配置操作 SOP

版本：`v1.3`
更新日期：2026-08-18
适用小程序：微信原生小程序，AppID `wx23b18a4b1624ec53`
配套代码状态：原生问答后端（`/v1/ask`）、微信登录（`/v1/auth/wechat/login`）、附件上传（`/v1/upload`）、语音转写（`/v1/asr`）、会话历史（`/v1/conversations` 与 `/v1/conversations/<id>`）均已部署并实测可用。

这份文档把微信后台配置变成可逐步照做的操作。所有域名均已在 2026-08-17 19:00 实测可达（HTTPS 返回 200），服务端接口也已 curl 验证通过，可直接填入。

> 架构说明：小程序**严格按已上线课程网站（ai4orgnization-theory.cn）的导航与内容同步制作**，底部 6 个 tab 与网站主导航一一对应；「知识」页的「参考文献」「项目平台」两个入口通过微信 `<web-view>` 内嵌课程网站 `www` 子域对应页面。因此**业务域名必须配置**（见第四节）。问答/登录/上传/语音四个接口均走 `www` 子域的 `/v1/*` 后端。

## 一、前置状态确认

- 生产服务器 80/443 已通：`http(s)://ai4orgnization-theory.cn` → 301 → `www`；`www`（课程站 :8765）返回 200。
- 域名 ICP 备案已完成（注册人：南京道器相济人工智能科技有限公司）。
- HTTPS 证书已部署（SAN 含裸域 / www / studio，2026-11-15 到期，certbot 每日 3 点续期）。
- 小程序 AppID 已写入 `project.config.json`，开发者工具可正常导入预览。
- 后端四类接口已部署并验证：`/v1/ask`（课程 RAG + 百炼 qwen3.7-plus）、`/v1/auth/wechat/login`（微信 code2Session）、`/v1/upload`（图片/文档，视觉/文档解析）、`/v1/asr`（语音转写，百炼 qwen3-asr-flash）。

## 二、AppSecret 安全（最先做）

AppSecret 此前已在聊天中明文出现，视为已泄露。

1. 登录 mp.weixin.qq.com → 开发 → 开发管理 → 开发设置。
2. 找到「小程序 AppSecret」，点击「重置」。
3. 新 AppSecret 通过 ssh 写入服务端 `/etc/default/course-platform` 的 `WX_APP_SECRET=<新值>`（已预留空位），**绝不写入小程序代码、Git、文档或聊天记录**。
4. 服务端用它换取 `openid` 时，只在 `code2Session` 调用中使用，不返回前端。写入后执行 `systemctl restart course-platform` 生效。

## 三、服务器域名（必配）

路径：开发 → 开发管理 → 开发设置 → **服务器域名**

> 小程序只能请求后台登记的 HTTPS 域名。裸 IP、localhost、`http` 一律不通过。本版四个接口全在 `www` 子域。

| 配置项 | 填入值 | 说明 |
|---|---|---|
| request 合法域名 | `https://www.ai4orgnization-theory.cn` | 问答 `POST /v1/ask`、登录 `POST /v1/auth/wechat/login`、语音转写 `POST /v1/asr` 均走此域。 |
| uploadFile 合法域名 | `https://www.ai4orgnization-theory.cn` | 附件上传 `POST /v1/upload`、语音上传 `POST /v1/asr` 走此域。**本版必填**（图片/文档/语音均经原生上传）。 |
| downloadFile 合法域名 | `https://www.ai4orgnization-theory.cn` | 附件回显、视频海报、web-view 内资源下载。 |
| socket 合法域名（wss） | 暂留空 | 接入流式问答（WebSocket）时再填。本版问答为一次性响应，暂不需要。 |

注意：
- 每个类型最多填 200 个域名，且必须是已备案 HTTPS。
- 修改后需在开发者工具中关闭「不校验合法域名」再做真机验证。

## 四、业务域名（必配 —— 与第三节同样重要）

路径：开发 → 开发管理 → 开发设置 → **业务域名**

> 只要小程序使用 `<web-view>` 内嵌外部网页，就必须在此登记业务域名，否则真机/审核环境会拦截并报 `url not in domain list`。
> 本版小程序的「知识」页「参考文献」「项目平台」两个入口**通过 `<web-view>` 打开 `www` 子域页面**，因此业务域名必须配置。

配置值（仅 `www`，不含 `studio`）：

| 业务域名 | 用途 |
|---|---|
| `https://www.ai4orgnization-theory.cn` | 「知识」页的参考文献、项目平台两个 web-view 入口 |

操作步骤：
1. 在业务域名列表中添加 `https://www.ai4orgnization-theory.cn`。
2. 微信会给出一个校验文件名（形如 `MP_verify_XXXXXXXXXXXX.txt`）。
3. **服务端已就绪**：把该校验文件内容发给我，我会把它放到服务器 `/opt/ai4org-theory/www-static/` 目录（nginx 已配置 `MP_verify_*.txt` 根路径直接可访问），无需你碰服务器。
4. 在微信后台点击「保存」完成校验（微信会自动访问 `https://www.ai4orgnization-theory.cn/MP_verify_xxx.txt` 验证 200）。

## 五、用户隐私保护指引（必填，影响审核）

路径：微信公众平台 → 设置 → 用户隐私保护（或「服务内容」中的隐私指引）

1. 勾选本小程序实际收集的信息类型，并填写用途说明（与小程序内「隐私保护指引」页一致）：

| 收集类型 | 用途说明（建议直接复制） |
|---|---|
| 微信账号（openid） | 通过 wx.login 的 code 向微信换取 openid，建立账号会话；不获取密码、session_key、支付信息。 |
| 语音（录音） | 「问答」模块语音输入：录音经语音识别服务（阿里百炼 qwen3-asr-flash）转为文字后进入问答流程。 |
| 相册/文件 | 「问答」模块上传图片、文档，由视觉/文档解析服务读取内容以回答用户问题。 |
| 昵称、头像（可选） | 用户主动在「我的」页设置展示名与头像，仅用于小程序内标识账号。 |

2. 在「隐私保护指引」文本框粘贴本 SOP 附录 A 的完整文本（与小程序内页面一致）。
3. 提交后一般即时生效；首次提交后需等待微信侧同步（几分钟）。

> 小程序代码已开启 `__usePrivacyCheck__: true`，并在首次进入时弹出隐私授权弹窗（基于 `wx.requirePrivacyAuthorize`）。未授权前不会调用登录/上传/录音等涉及隐私的接口。

## 六、类目（工具）

- 当前类目锁定**「工具」**（非教育/培训），企业已具备 AI 相关资质。
- 上传代码、提交审核时，类目保持「工具」即可；不要在文案中自称"课程/培训/教学/授课/考核/成绩"，统一使用「内容 / 资料 / 学习辅助工具」口径（小程序 UI 已按此口径改写）。

## 七、配置后验证

1. 微信开发者工具 → 详情 → 本地设置 → 取消勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」。
2. 编译小程序，进入「问答」：用文字提问确认 `/v1/ask` 正常；点「+」上传一张图片确认 `/v1/upload` 正常；按住「说话」录一句话确认 `/v1/asr` 转写后自动发送；进入「我的」用微信登录确认 `/v1/auth/wechat/login` 正常。
3. 真机预览（扫码），在 4G/其他 Wi-Fi 下走查六个底部入口，并打开「知识」页的「参考文献」「项目平台」两个 web-view，确认无 `url not in domain list` 报错。

## 八、提交审核前的最后确认

- [ ] 第二节：AppSecret 已重置并写入服务端。
- [ ] 第三节：request / uploadFile / downloadFile 三类合法域名已填 `www`。
- [ ] 第四节：业务域名 `www` 已校验通过（校验文件已落服务器）。
- [ ] 第五节：隐私保护指引已填（收集类型 + 用途 + 附录 A 文本）。
- [ ] 第六节：开发者工具关闭「不校验」后真机验证四项接口 + 两个 web-view 均正常。
- [ ] 代码已用微信开发者工具「上传」为体验版/审核版，版本号已填。

---

## 附录 A：隐私保护指引（可直接粘贴到微信后台）

```
隐私保护指引

一、我们是谁
本小程序为《人工智能与组织管理》内容的学习辅助工具，由内容团队提供，服务端域名为 ai4orgnization-theory.cn。

二、我们收集的信息
1. 微信登录凭证（login code）：用于向微信换取你的微信 openid，以此建立账号会话。我们不获取你的微信密码、session_key 或支付信息。
2. 问答内容：你在"问答"模块输入的文字、语音、图片、文档及由此产生的问答记录会提交给本工具服务器。其中语音先经语音识别服务（阿里百炼 qwen3-asr-flash）转为文字；图片与文档由视觉/文档解析服务读取内容；随后与你的文字问题一并转发给大语言模型服务（阿里百炼 qwen3.7-plus）以生成回答。这些数据仅用于回答你的问题，不会用于训练第三方模型。
3. 可选的展示信息：如你主动设置，我们会保存你填写的展示名与头像，仅用于在小程序内标识账号。
4. 内嵌网页内容：资料、参考文献与项目平台通过微信 web-view 打开内容网站对应页面，其数据收集遵循该网站的隐私政策，不在本小程序服务端留存。

三、我们如何使用
用于建立账号、回答问题、提供可选的展示信息，并通过内嵌网页为你打开内容网站的资料、参考文献与项目平台。

四、我们如何共享
我们不向任何第三方出售或共享你的个人信息。你的内容仅由本工具服务器处理与存储。

五、你的权利
你可随时在"我的"页修改展示信息、申请注销账号与导出数据，也可在"问答"模块查看自己的提问历史。注销后我们将删除你的个人账号数据与问答历史。

六、联系方式
如需行使上述权利或咨询隐私问题，可通过"我的 > 关于本工具"中的联系方式与我们联系。
```

## 九、附录 A：开发者速查（小程序端已对接接口）

> 仅供开发者核对；用户操作人员无需关注本节。

| 端点 | 方法 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `/v1/auth/wechat/login` | POST | 公开 | code → openid，颁发 `aio_session` cookie 30 天 |
| `/v1/ask` | POST | 公开（按 IP 限流 20/分钟） | 课程 RAG + 百炼 qwen3.7-plus |
| `/v1/upload` | POST（multipart） | 公开 | 图片/文档，返回 `/v1/file?name=…` URL |
| `/v1/file?name=…` | GET | URL 已知 | 静态回传已上传文件 |
| `/v1/asr` | POST（multipart） | 公开 | 语音转写（百炼 qwen3-asr-flash Base64 同步） |
| `/v1/conversations` | GET | aio_session | 列出当前用户未归档的会话摘要 |
| `/v1/conversations` | POST | aio_session | 新建会话；首次 user 消息自动摘要标题 |
| `/v1/conversations/<id>` | GET | aio_session（仅所有者） | 拉取完整消息列表 |
| `/v1/conversations/<id>` | PUT | aio_session（仅所有者） | 追加一条 `{role, content, attachments}` |
| `/v1/conversations/<id>` | DELETE | aio_session（仅所有者） | 软删（`archived=true`） |

**隔离性**：非所有者的 `GET/PUT/DELETE` 一律返回 404，不暴露"存在但不可见"信息。
**持久化**：服务端落 `data/conversations.json`（原子写：tmp + fsync + `os.replace`），Stage 02 切 Postgres 时该 JSON 字段可整表对应 `conversations` 表。
**前端落点**：`miniprogram/services/ask.js` 暴露 `listConversations / createConversation / getConversation / appendMessage / deleteConversation`；`pages/ask/index.js` 在 `bootstrapConversation()` 自动建空会话，`_persistMessage()` 在用户发问/收答后落库。
