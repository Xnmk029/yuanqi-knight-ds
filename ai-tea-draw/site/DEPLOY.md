# 发布 AI 茶绘：GitHub Pages 与 Releases

**当前状态：公开站点和 Release 尚未发布。** 仓库中的 `release-manifest.json` 标为 `local-build`，不含公开资产 URL。本文的 `<OWNER>`、`<REPOSITORY>`、`<TAG>` 都是必须替换的占位符，不是已存在的地址。本轮只准备源码、构建和发布说明，没有创建仓库、上传资产或启用网站。

Pages 托管 `site/` 内的静态入口、接入说明和下载清单；Release 托管 Windows ZIP。本机程序连接 Steam 并提供网页画布，玩家无需给网站提供模型账号。GitHub Pages 不运行这套 Node/Steam 后端。[GitHub Pages 官方说明](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## 1. 确定正式地址

可以把整个 `ai-tea-draw/` 目录作为独立仓库根目录发布，也可以保留在现有仓库的同名子目录中。应用包含固定来源的 `transport/`，不需要把旁边被忽略的联机组件仓库一起上传。

发布者需要确定以下真实值，并在上线后逐个打开验证：

| 用途 | 固定版本地址格式 |
| --- | --- |
| 源码与 Release 仓库 | `https://github.com/<OWNER>/<REPOSITORY>` |
| 静态加入页 | `https://<OWNER>.github.io/<REPOSITORY>/` |
| Agent 指引 | `https://<OWNER>.github.io/<REPOSITORY>/AGENT-START.md` |
| 下载清单 | `https://<OWNER>.github.io/<REPOSITORY>/release-manifest.json` |
| PowerShell 安装器 | `https://<OWNER>.github.io/<REPOSITORY>/bootstrap.ps1` |
| Release 资产基地址 | `https://github.com/<OWNER>/<REPOSITORY>/releases/download/<TAG>/` |

若采用 `<OWNER>.github.io` 用户站点或自定义域名，以 GitHub Settings → Pages 显示的真实网站地址为准，不能直接套用项目站点路径。公开指引地址应由发布者掌控并提供给玩家；房间邀请不能指定另一个任意安装源。

## 2. 构建固定版本资产

在 Windows x64 的源码目录执行。当前程序版本为 `0.3.0`，可用对应标签 `v0.3.0`；源码版本变化时，先统一程序和发行脚本中的版本，再换标签。

```powershell
npm ci
npm test
npm run verify
node scripts/release.js --base-url "https://github.com/<OWNER>/<REPOSITORY>/releases/download/v0.3.0/"
```

`npm run verify` 退出 0 表示检查通过，退出 1 表示失败，退出 2 表示有实际环境阻塞。应查看 `verification/report.json`：真实多账号 Steam 与 mock 是分开的结果，不能把模拟成功写成跨账号验收通过。当前缺少第二个不同账号自动化端时，保留这项明确限制。

便携包构建需要与当前 Node 版本匹配的许可文件 `licenses/node-<node版本>.txt`；也可将 `NODE_LICENSE_FILE` 指向已核对的许可证。`release.js` 会生成：

```text
dist/ai-tea-draw-0.3.0-windows-x64-lite.zip
dist/ai-tea-draw-0.3.0-windows-x64-lite.zip.sha256
dist/ai-tea-draw-0.3.0-windows-x64-portable.zip
dist/ai-tea-draw-0.3.0-windows-x64-portable.zip.sha256
dist/release-manifest.json
site/release-manifest.json
site/AGENT-START.md
```

填写 `--base-url` 后，清单状态为 `ready-for-upload`，每种资产带真实 HTTPS URL、长度和 SHA-256；这仍只表示准备上传，不表示网站已经上线。构建后检查 ZIP 内包含 `transport/`、项目/第三方许可证、生产依赖及内部 `manifest.json`。不要把 `data/`、会话文件或测试邀请上传到公开站点。

## 3. 创建 Release 并上传

在确定的仓库创建对应标签的 Release 草稿，上传上述两个 ZIP、两个 `.sha256` 文件及 `dist/release-manifest.json`，核对标签、文件名和 SHA-256 后发布。Release 说明列出 Windows x64、lite 需要 Node ≥20、portable 自带 Node，以及真实多账号验证的实际状态。GitHub 的源码自动压缩包不包含已打包运行依赖，不能替代这两个玩家包。[GitHub Release 官方流程](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

发布后的固定资产应与清单一致，避免用 `latest` 下载地址替代固定标签。如果还要改程序，使用新的版本与标签重新构建。单独提供同源 SHA-256 能验证下载完整性，不能等同于独立数字签名；首次下载仍依赖用户认可的正式发行源。

## 4. 部署静态网站

推荐在仓库 Settings → Pages → Build and deployment 中选择 **GitHub Actions**，使用 GitHub 提供的 [Static HTML 工作流模板](https://github.com/actions/starter-workflows/blob/main/pages/static.yml)，将上传 Pages artifact 的路径设置为：

- 独立茶绘仓库：`site`。
- 仍在元气骑士仓库内：`ai-tea-draw/site`。

部署 artifact 的顶层应直接包含 `index.html`、`site.js`、`site.css`、`INSTALL.md`、`AGENT-START.md`、`bootstrap.ps1` 和 `release-manifest.json`，不需要 npm 安装或构建网页。保留模板的 Pages 发布权限和 `github-pages` 环境设置，推送工作流后在 Actions 查看部署结果。通过分支发布时，GitHub 仅提供仓库根目录或 `/docs` 作为源目录选项；不能在这个下拉框直接选择 `site/`。[GitHub Pages 发布源配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

先确认 Release 下载已经可用，再提交最终的 `site/release-manifest.json` 并发布 Pages。访问真实网站，检查加入页、Agent 指引、安装器和 JSON 清单都能读取；清单指向的两个 ZIP 下载后，长度及 SHA-256 必须吻合。未完成这些检查时继续标记「尚未公开发布」。

## 5. 房主提供一句话邀请

房主先登录 Steam，再在玩家包目录启动；下面必须替换为已经验证可访问的指引 URL：

```powershell
tea.cmd host --topic "深海夜市" --guide-url "https://<OWNER>.github.io/<REPOSITORY>/AGENT-START.md"
```

源码启动方式为 `node src/main.js --guide-url <真实指引URL>`，也可使用环境变量 `AI_TEA_GUIDE_URL`。Agent 开房结果已返回可转发的 shareMessage，网页也可以点「复制 Agent 邀请」，获得包含 **真实指引 URL + 完整 tea 邀请** 的句子：

> 按照这份 AI 茶绘接入指引 <真实 AGENT-START.md URL>，校验安装并加入房间 <完整 tea://join/... 邀请>，打开画布，读取房规后等我安排。

朋友把这句话交给支持本机命令执行的 Agent。Agent 从正式指引定位清单和安装器，校验包、安装到用户缓存、调用加入程序、打开画布，并保存返回的 `sessionFile`。首次未安装时，现成的 `bootstrap.ps1` 可下载便携包并直接加入：

```powershell
# 先从已认可的真实站点取得并读取 bootstrap.ps1，将完整邀请保存为私有 invite.txt。
powershell -NoProfile -File .\bootstrap.ps1 -ManifestUrl "<真实 release-manifest.json HTTPS URL>" -InviteFile ".\invite.txt" -Name "小鲸鱼"
```

安装器同时支持 `-InstallOnly`；已有源码/程序且有兼容 Node 的玩家，可使用 `scripts/bootstrap.js --manifest <真实清单URL> --kind lite` 校验/复用轻量包，再调用返回目录中的 `scripts/join.js`。`scripts/bootstrap.js` 是程序文件，不在当前静态站点中单独提供。已经安装的玩家直接运行 `join.cmd --invite-file invite.txt --name 小鲸鱼`，重复执行会复用本机会话。

如果要先让人看静态加入页，可以提供 `<真实 Pages 根URL>#tea://join/...`，邀请放在 fragment；不要移入查询参数或公开页面源码。网站「复制一句话」按钮会转为同样的指引 + 完整邀请，Agent 无需靠网页脚本读取 fragment。

这条流程适用于具备本机执行权限的 Agent。安装执行确认、Steam 登录及示例 AppID 的可用性仍由实际客户端环境决定；出现阻塞时只报告缺少的那一步。公开站点上线也不等于真实多账号 Steam 已验收。

## Steam 房间与邀请边界

茶绘使用 Steam Public 大厅，使非好友可尝试按大厅链接加入；应用另用 24 小时秘钥验证绘图会话。它不是原生私密大厅，未通过应用授权的成员可能占用 Steam 原生席位，当前没有原生踢人功能。非好友可用性和不同账号间的数据链路需要真实平台验证。完整邀请具有入场凭据作用；房主自行交给朋友，程序不会替用户发送消息。

## 一次手动运行发布下载入口与网站

已提供 [publish-to-github.yml](publish-to-github.yml) 工作流模板；复制到明确选定的公开仓库的 .github/workflows/ai-tea-release.yml。Pages 发布源设为 GitHub Actions。独立应用仓库选择 source_dir 为点号，保留现有子目录时选择 ai-tea-draw。

手动运行后会安装依赖、执行单元测试和生产依赖审计、构建两个包与固定版本清单、创建并发布 ai-tea-v0.3.0 Release，然后部署静态入口。已存在同版本 Release 时拒绝覆盖，必须升版本；私有仓库也会拒绝发布玩家入口，不会改变仓库可见性。构建使用 Node 24.15.0 和仓库内对应许可。

部署后工作流读取真实 Pages 地址，下载核对两个 Release ZIP 的大小与 SHA-256，并检查安装说明、接入指引、安装器和网页文件；也可本地执行 node scripts/verify-public.js <真实网站HTTPS根地址>。下载检查通过才算公开入口已验证。该工作流未在远端运行，当前网站仍未公开发布；它不执行真实 Steam 多账号测试。

网站新增“复制安装指令”，指向同目录 INSTALL.md。首次玩家可以让 Agent 执行 -Setup -Agent <当前客户端>，完成下载、配置和 MCP 握手；不传开房或邀请时安装器默认做配置。同一调用还可携带 -CreateRoom 或 -InviteFile，立即联机。需要先使用正式发布入口，不能把本机验证服务器当作公开地址。
