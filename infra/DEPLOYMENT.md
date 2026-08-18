# 发布操作手册

这份手册把发布分成“服务器准备、暗测、正式开放、上线后检查”四段。域名和备案号均使用占位符，发布时从阿里云控制台复制真实值替换。

## 一、正式发布前的决定

先确认以下四项：

1. **域名原文**：从阿里云域名控制台复制，确认是否确实为 `ai4orgnization-theory.cn`，同时确认 `www` 子域名；
2. **首版公开范围**：建议只公开首页、课程大纲、课程教材导航和关于页面；知识库文献下载、AI 问答与学生作业功能完成版权和安全检查后再开放；
3. **备案展示信息**：确认 ICP 备案号的完整文本，以及应链接的工信部备案查询地址；
4. **网站身份说明**：备案主体为公司、页面展示南京大学和教师信息时，应获得相应授权，避免让访问者误认为这是南京大学官方门户。建议在页脚写明“课程教学项目网站”及运营主体。

## 二、服务器准备（尚不对外）

### 1. ECS 与安全组

保留以下入站端口：

- `22/TCP`：SSH，仅允许管理者固定 IP；
- `80/TCP`：HTTP，用于跳转 HTTPS 和证书验证；
- `443/TCP`：HTTPS。

不要开放 `8765`。Python 服务应只监听 `127.0.0.1:8765`。

### 2. 安装运行组件

服务器需要 Nginx、Python 3、`rsync`、`tar`，知识库读取 PDF 时还需要 `pdftotext`。在 Alibaba Cloud Linux 上，先通过包管理器查询软件包名称，再安装；不同镜像版本的软件包名可能不同，不在此硬编码。

### 3. 创建专用账户和目录

使用普通系统账户 `courseweb` 运行网站，不用 root 运行应用。目录结构见 [README.md](README.md)。真实的千问 Key 写入：

```text
/srv/ai4organization-theory/shared/course-platform.env
```

文件权限设为仅 root 和服务账户可读。可从 `course-platform.env.example` 复制，绝不提交真实 Key。

`COURSE_AI_ENABLED` 默认必须保持 `false`。只有在登录、单用户/单 IP 限频、每日费用上限和日志脱敏均配置完成后，才改为 `true`。

### 4. 安装服务文件

将 `systemd/course-platform.service` 复制到 systemd 服务目录，将 `nginx/course-site.conf` 复制到 Nginx 配置目录。替换配置中的：

- `YOUR_DOMAIN`；
- `www.YOUR_DOMAIN`；
- 证书和私钥路径。

先执行 Nginx 配置检查，检查通过后才重载服务。

## 三、上传方式

### 推荐方式：版本包 + SCP/OSS 中转

在本地项目根目录执行：

```bash
bash 线上教学课程平台的智能体建设/infra/scripts/package-release.sh
```

脚本会在 `infra/artifacts/` 生成带时间戳的 `.tar.gz` 和 `.sha256`。压缩包只包含课程应用以及经过筛选的公开资料；默认不包含 Git 文件、测试截图、缓存、密钥和环境文件。

把压缩包上传到服务器临时目录，再按以下顺序处理：

1. 对照 `.sha256` 验证文件完整性；
2. 解压至新的 `releases/<时间戳>/`；
3. 让服务临时指向新版本并在本机检查；
4. 检查通过后切换 `current` 软链接；
5. 重启 `course-platform`；
6. 执行 `scripts/verify-release.sh`。

不要用 FTP，也不要直接覆盖 `current` 中的文件。直接覆盖会留下新旧文件混合状态，失败时也难以回退。

## 三（补充）、OpenMAIC 独立部署包须知

OpenMAIC 以 Next.js `output: 'standalone'` 编译，独立运行于 `127.0.0.1:3100`，由 Nginx 反代到 `studio` 子域。打包独立部署包时，**必须包含 `.next/static` 目录**（客户端 JS/CSS/媒体资源），否则浏览器只会拿到 HTML 壳、React 应用无法加载，表现为“点开教学平台但页面无功能 / 白屏”。

- **正确打包**：`tar czf openmaic-standalone.tar.gz -C <build根> openmaic-standalone`（整目录打包，含 `.next/static`、`.next/server`、`standalone/server.js`、`node_modules`）。不要为减小体积排除 `.next/static`。
- **校验**：解压后确认 `standalone/.next/static/chunks/` 存在且有文件；上线后用 `curl -I https://studio.<域名>/_next/static/chunks/<hash>.js` 确认返回 `200`。
- **已运行进程不热感知新增静态目录**：若上线后发现 JS 404，在服务器补齐 `standalone/.next/static` 后，**必须重启 openmaic 服务**（`systemctl restart openmaic`），否则仍 404。
- **拼写提示**：`openmaic.service` 的 `ALLOWED_FRAME_ANCESTORS` 当前写的是旧拼写 `ai4organization-theory.cn`（带 a），与实际上线域名 `ai4orgnization-theory.cn` 不符；当前为独立子域新标签打开、未用 iframe，故无影响，未来若需 iframe 嵌入再修正。
- **本地与服务器 build 一致性**：本地 `apps/openmaic/.next/static` 的 `BUILD_ID` 须与服务器 `.next/BUILD_ID` 一致，静态资源哈希才能匹配 HTML 引用。应急补齐静态资源时，优先取同源 build 的产物。

## 四、暗测：不改正式 DNS

在域名解析前，先通过 SSH 隧道访问生产服务：

```bash
ssh -L 8765:127.0.0.1:8765 courseweb@SERVER_IP
```

然后在本机打开：

```text
http://127.0.0.1:8765/index.html
```

暗测至少检查：

- 六个页面、手机端布局和所有导航；
- `/api/library`、允许公开的阅读与下载；
- 未配置千问 Key 时是否只显示可理解的提示；
- 配置 Key 后问答是否可用，Key 是否没有出现在网页源代码和日志中；
- 大文件下载是否会导致服务异常；
- 首页底部的 ICP 备案号、主体说明和联系方式；
- 不公开的资料、教师后台、学生数据是否无法访问。

## 五、正式开放

1. 在阿里云 DNS 中为根域名添加指向 ECS 公网 IP 的 `A` 记录；
2. 为 `www` 添加 `CNAME` 指向根域名，或添加同 IP 的 `A` 记录；
3. 初次切换可使用较短 TTL，稳定后再调回常规值；
4. 申请覆盖根域名和 `www` 的 SSL 证书，安装到 Nginx；
5. 确认 HTTP 自动跳转 HTTPS；
6. 从外网分别测试根域名和 `www`；
7. 确认搜索引擎暂不应收录的页面带有适当限制，再公布链接。

阿里云官方说明，同一阿里云接入商内更换非经营性网站服务器，一般只需修改域名解析；当前备案页 IP 与 ECS 公网 IP 不同本身不等于备案失效。但切换前仍要确认备案控制台状态正常、服务器仍属于同一备案主体和阿里云中国内地接入。

## 六、上线后 30 日内

- 在全国互联网安全管理服务平台提交公安联网备案；
- 审核通过后，在网页底部悬挂公安备案图标和编号；
- 检查网站名称、内容、主体、联系方式与备案填报信息一致；
- 建立每日至少一次的可恢复备份；有学生数据后，数据库与上传文件分别备份；
- 检查日志轮转、磁盘空间、证书到期提醒和 ECS 续费提醒。

## 七、回滚

若新版本页面或接口异常：

1. 查找上一版 `releases/<时间戳>/`；
2. 将 `current` 软链接切回上一版；
3. 重启 `course-platform`；
4. 运行 `verify-release.sh`；
5. 保留失败版本和日志用于排查，不在生产目录现场改代码。

DNS、证书和服务器变更与应用版本回滚分开处理。一般的页面故障不需要改 DNS。
