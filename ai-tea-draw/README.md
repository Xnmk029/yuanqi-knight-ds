# AI 茶绘 v0.4

带自己的 Agent，一起画可编辑 SVG。网页是画布，本机服务管理 Steam 联机、归属、限额和审核，CLI/MCP 不接触模型账号。

v0.4 已实现 **图文传话、你画我猜、私有 SVG 绘图工作台和有序笔画流**。进入网页的「游戏与绘图」，选择玩法与房规即可。中立主持人审核为默认；熟人确认模式允许房主参赛。传话每人先写一句话，再在固定轮换中画图/看图描述，全场结束才揭晓；双人传话明确标为练习。猜画默认三个「私下画图→审核→共同看图猜词」检查点，猜词结果只给本人，揭晓时计分，每个人轮流当画手。

画笔、钢笔曲线、绝对路径节点编辑、矩形/椭圆/直线、选择/多选、对象橡皮、吸色、颜色/线宽/透明度、图层锁定/隐藏/排序、编组/解组、复制、移动/旋转/缩放、对齐与撤销/重做均以 SVG 为事实源。当前是基础矢量编辑工具；尚未实现压感笔刷、位图编辑、布尔擦除、蒙版或 PSD 工作流。

Agent 可获取当前任务的原生 MCP 图片、自己的编辑状态、最多三个明确同意共享的 SVG 技法片段。猜画/看图描述时无法读取别人的未揭晓 SVG、答案、标题或操作流。主持人用本机隔离进程生成 PNG，再绑定哈希审核。游戏中新增手法共享被禁止，游戏开始时固定示例池，作者可撤回后续访问。

一句话开游戏房的 MCP 参数是 `tea_create_room({gameMode:"telephone",reviewPolicy:"moderator-strict",maxMembers:4})`；CLI 是 `tea.cmd host --game-mode telephone --review-policy moderator-strict --max-members 4`。加入流程不变。全部游戏玩家使用 v0.4；详细 Agent 流程与流式协议见 [GAMES-AND-STREAM.md](GAMES-AND-STREAM.md)。审核/开始/暂停等由房主网页操作，Agent 不获得管理凭据。

**公开网站和 Release 尚未发布。** 当前 `site/release-manifest.json` 的 `local-build` 仅描述本地生成的包，没有可供外部玩家下载的正式 URL。公开后的一句话接入流程与待填写的地址见 [部署说明](site/DEPLOY.md)。

## 在 Agent 内一句话开房 / 加入

首次接入也可以说：**「按照这份安装说明，帮我安装并配置 AI 茶绘到当前 Agent，验证连接。」** [安装说明](INSTALL.md) 提供实际执行流程。已有便携包只需 `tea.cmd setup --agent codex`；替换为 `claude`、`cursor`、`vscode` 或 `gemini` 即可。公开入口的 PowerShell 安装器支持 `-Setup -Agent <客户端>`，一次完成校验下载、安装、MCP 握手和配置合并，随后可在同次执行开房或加入。

配置会备份原文件，保留其他 MCP、注释和设置；重复运行复用，遇同名冲突会报告。没有唯一识别到客户端时返回通用配置，不能假称安装已完成。MCP 握手通过与宿主重载、Steam 联机分开报告；当前任务可先用 CLI，无需等待当前聊天热加载新工具。

已经取得程序或配置茶绘 MCP 后，A 可以说：**「帮我开一个主题为深海夜市的四人 AI 茶绘房，打开画布，把邀请给我。」** Agent 自动启动本机服务、创建房间，返回可直接转发的 `shareMessage`。B 把这整句话交给自己的 Agent，要求加入并打开画布即可。人不需要操作终端、填写会话路径或在网页建房。

底层只有一条命令：

```powershell
# A：安装包内执行；不需要提前启动服务。
tea.cmd host --topic "深海夜市" --name "A"
# B：Agent 将 A 的整句邀请写入私有文件后执行。
tea.cmd join --invite-file invite.txt --name "B"
```

源码对应 `node scripts/tea.js host ...` / `node scripts/tea.js join ...`。也可使用 `host.cmd` / `join.cmd`。MCP 启动只需 `node src/mcp.js`，无需预先提供 session；新增 `tea_create_room`，`tea_join_room` 同样会准备服务，工具返回后自动切换到正确会话。Agent 配置一次 MCP 后可以直接调用；没有 MCP 配置的 Agent 使用 CLI，不必修改永久配置。

并发重复开房、重复加入会复用同一后台服务和房间，不清空画布。在另一场房间中时返回 `ALREADY_IN_ROOM`，不会默默替用户离房。邀请文件/标准输入可接受 A 返回的整句 `shareMessage`，无需人手动截取长邀请码。绘图 Agent 仍没有审核权限，网页由服务内部打开。

首次未安装时，A 与 B 都可让 Agent 按正式接入指引完成安装：PowerShell 安装器新增 `-CreateRoom -Topic <主题>`，原有 `-InviteFile` 负责加入，安装和联机在同一次执行完成。静态首页也提供「复制开房指令」「复制加入指令」。未配置公开指引 URL 时，邀请会明确朋友需先取得程序；不会把 A 的本机路径当作 B 的下载地址。

## 独立源码与安装

`ai-tea-draw/` 是可单独复制、建仓和安装的应用目录。源码包含 `src/`、`public/`、`scripts/`、`site/`、`transport/`、测试、锁文件和许可证，不依赖当前工作区旁边的联机组件仓库，也不需要原游戏的 JS 或资源。

`transport/` 固定采用联机组件 `55cb875` 的来源版本，并携带默认两人不变、可配置人数的本地修改；[provenance.json](transport/provenance.json) 记录上游地址、修改说明和各文件 SHA-256。茶绘应用使用最多八席，原组件的默认行为保留。

在 Windows x64 上安装 Node.js ≥20，再在应用目录执行：

```powershell
npm ci
node src/main.js
```

`npm ci` 是源码开发者的依赖安装步骤。玩家取得 lite/portable ZIP 后，生产依赖和传输源码已经随包提供，无需在玩家机器上运行 npm。源码验证器使用已安装的 Chrome 或 Edge；浏览器与自动化工具不属于玩家核心包。

## 在当前工作区体验

```powershell
cd G:\projects\yuanqi-knight\ai-tea-draw
node scripts/demo.js
```

这是四人本机演练，示例作品由固定 SVG 生成，不代表外部 AI 或真实跨账号 Steam 已验收。默认启动 Steam 正式接入路径：

```powershell
node src/main.js
```

Steam 路径需要已登录的本机 Steam，以及 AppID 480 访问权。茶绘创建 **Steam Public 大厅**，方便非好友凭完整大厅邀请加入；房主随后用应用层的 24 小时邀请秘钥验证参与者。它不是 Steam 原生私密大厅：没有应用邀请的人仍可能占用原生席位，当前没有原生踢人功能。示例环境可用性由 Valve 决定，真实非好友与多账号加入仍需分别验证。

## 玩家快速加入

房主在网页选择主题、人数和审核模式，复制邀请交给朋友。已经取得发布包的玩家，可以让自己的 Agent 执行：

```powershell
node scripts/join.js --invite-file .\invite.txt --name 小鲸鱼
```

没有 Node 的 Windows 玩家使用便携包：`join.cmd --invite-file invite.txt --name 小鲸鱼`。程序自动复用/启动后台服务、加入、同步并打开画布；结果返回正确的 session 文件和 MCP 配置。邀请通过文件或 stdin 传递，避免记录在进程参数中。程序只保存用户缓存，不改 PATH、不需要管理员权限、不设置开机启动。首次安装执行仍可能受 Agent 客户端确认规则约束；登录 Steam 由玩家完成。

`site/` 是可部署到 GitHub Pages 的静态加入页与接入说明。它负责入口和分发，本机服务负责画布与 Steam。公开部署后，房主用真实指引 URL 启动：

```powershell
node src/main.js --guide-url "https://<OWNER>.github.io/<REPOSITORY>/AGENT-START.md"
```

以上是待替换的地址格式，不是现成网站。玩家包可用 `start.cmd --guide-url <真实指引URL>`，或设置 `AI_TEA_GUIDE_URL`。网页的「复制 Agent 邀请」会生成：

> 按照这份 AI 茶绘接入指引 <真实 AGENT-START.md URL>，校验安装并加入房间 <完整 tea:// 邀请>，打开画布，读取房规后等我安排。

朋友将这句话交给具有本机执行能力的 Agent；它按公开指引取得/复用缓存程序，校验安装，加入并打开画布，返回受限会话。未配置公开指引时，邀请只适用于已经取得程序的玩家。发布者需要填写 Pages 指引 URL 与固定版本 Release 资产 URL；步骤见 [DEPLOY.md](site/DEPLOY.md)。

## CLI / MCP

```powershell
node src/cli.js --session <join结果中的sessionFile> status
node src/cli.js --session <sessionFile> validate --file whale.svg
node src/cli.js --session <sessionFile> submit --file whale.svg --name 鲸鱼茶摊 --id my-job-1
node src/cli.js --session <sessionFile> proposals
node src/cli.js --session <sessionFile> export --out canvas.svg
```

MCP stdio：`node src/mcp.js --session <sessionFile>`，详见 [AGENT-START.md](AGENT-START.md)。支持标准初始化、工具发现、结构化结果与取消；CLI 可作为无需更改 Agent MCP 配置的入口。兼容具有 MCP 或本机命令执行能力的 Agent，封闭客户端不能保证接入。

Agent session 只有绘图凭据。房主也必须在网页审核；默认 CLI/MCP 的 approve/freeze 等管理操作返回 `FORBIDDEN`。本机拥有同等操作系统权限的恶意程序不在这个凭据隔离所能防御的范围内。

## 已实现的规则

- 2 / 4 / 8 个席位，默认先审后发；熟人模式首稿仍需人工批准。
- 每位成员固定独立区域，占画布总面积最多 80%，公共部分暂不开放。席位与作品归属保留，离线成员不会被新成员复用。
- 每人最多两份待审稿，发布速率每分钟 6 次、突发 2 次；多 Agent 共用额度。可选任务预留 5 分钟、每人一个；有活动预留时，提交必须带相应 `leaseId` 并落在预留区域。取消会撤销该任务关联的待审稿，批准时也重新校验是否到期；已发布作品保留。没有活动预留时可独立提交草稿。取消不会终止外部 Agent 进程。
- 受限 XML 解析与 SVG 允许列表：基础形状、路径、有限变换、本地渐变。禁止文字/CSS/图片/脚本/事件/外链/实体/动画；超限明确拒绝。
- 每作品 256 KiB、2,000 元素、12,000 路径指令、16 层；自由画布最多 512 件作品，场景 8 MiB、30,000 元素、120,000 路径指令。按访问权限过滤的同步快照限制为 16 MiB；本机私有档案限制为 64 MiB，游戏资产另限 24 MiB。确认落盘前检查，超限回滚。自由作品历史额外最多 2 MiB，日志轮换。
- 房主从传输身份确定作者，校验区域、版本、哈希、预算，落盘后确认；重复操作 ID 幂等，换内容则报冲突。
- 待审图仅作者和网页房主可见；批准后原子发布。支持拒绝、全房暂停、隐藏、本人按版本撤销。撤销不能取消管理员隐藏。
- 压缩快照分片，完整哈希校验、大小/时限限制、后加入同步；周期摘要检测最后一次更新丢失并修复。
- 浏览器刷新不离房。房主退出结束本场；所有端可从已确认的本机存档离线查看/导出。开新房会创建新会话，不声称房主迁移。
- 可导出含独立作品组、裁剪、归属的 SVG，以及服务返回的工程 JSON。网页图片上下文展示规范化 SVG，不向 DOM 注入上传 XML。

没有接入自动图像内容审核模型；「通过技术检查」只说明符合 SVG 子集。内容是否符合房规由房主看图决定。当前不含自由区域协商、跨作者共同修改路径、公开房间广场和自动接管房主。游戏任务与 MCP 上下文可提供权限允许的 PNG；核心包使用隔离的原生渲染进程，不携带 Chrome/Playwright。

## 自动验证与打包

```powershell
npm test
npm run verify
node scripts/release.js
node scripts/package.js
node scripts/package.js --portable
```

验证器生成 JSON/JUnit/截图，自动检查 8 个进程端点、4 个浏览器的两种游戏完整流程、绘图界面、CLI 流式输入、31 个 MCP 工具、隔离审核、同步、持久化与安装包 SHA-256。Steam 检查分开报告；没有另一台已登录不同账号的机器时，真实多账号链路标为 blocked，mock 成功不会替代它。

lite 包不含 Node；portable 包带当前 Windows Node 及其许可证。仅携带 Windows x64 Steam 原生文件和生产依赖，不携带 Electron、Playwright、macOS/Linux 原生文件。`release.js` 同时构建两种 ZIP 和下载清单；只有填写真实 `--base-url`、上传资产并验证公开链接后，才可分发公开接入指引。发布 artifact 的 SHA-256 用于完整性校验，不等同于数字签名。
