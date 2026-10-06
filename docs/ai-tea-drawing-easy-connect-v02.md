# AI 茶绘 v0.2：Agent 一句话开房与加入

2026-10-04。实现已完成，Windows x64 玩家包已生成；真实跨账号 Steam 尚未验收，公开网站与下载入口尚未发布。

## 玩家流程

A 已取得程序或配置茶绘 MCP 时，说：「帮我开一个主题为深海夜市的四人 AI 茶绘房，打开画布，把邀请给我。」Agent 调用 `tea_create_room`，或者执行 `tea.cmd host --topic "深海夜市" --name A`。程序自动准备后台服务、创建房间、打开画布，返回完整的 `shareMessage`。

B 将 A 返回的整句话交给自己的 Agent，说「加入这个房间，打开画布」。Agent 调用 `tea_join_room`，或者将整句邀请保存到私有文件后执行 `tea.cmd join --invite-file invite.txt --name B`。不需要人手截取邀请码、复制端口或维护会话文件。

首次没有程序时，Agent 需要用户认可的安装包或真实 HTTPS 接入指引。安装器支持 `-CreateRoom -Topic <主题>` 与 `-InviteFile <私有邀请文件>`，在一次动作内完成校验安装及开房/加入。当前发行清单为 `local-build`，没有公开下载 URL；不能把本机路径冒充朋友可用的网络地址。公开后可以直接转发「指引 URL + 完整邀请」；静态首页提供开房与加入指令的复制入口。

CLI 可用于具备本机命令执行能力的 Agent，无需永久注册 MCP。使用 MCP 的 Agent 配置一次 `mcp.cmd` 或 `node src/mcp.js` 即可；启动不再要求预填 session。应用不代办 Steam 登录，不收集模型 API key。

## 实现

| 位置 | 行为 |
| --- | --- |
| `ai-tea-draw/src/launcher.js` | 开房、加入共用生命周期；版本化缓存、后台启动、服务发现和房间复用；返回 CLI/MCP 入口及实际连接模式 |
| `scripts/tea.js`、`host.js`、`join.js` | 单命令开房/加入；完整邀请句、私有文件或 stdin；后续绘图命令兼容现有 CLI |
| `src/mcp.js` | 新增 `tea_create_room`；`tea_join_room` 自动准备服务；调用后更新本进程使用的 session；共 15 项工具 |
| `scripts/bootstrap.js`、`site/bootstrap.ps1` | 校验/缓存安装后直接开房或加入；可信清单目录提供接入指引地址 |
| `site/`、`AGENT-START.md` | 网页复制开房指令，指导外部 Agent 取得程序、连接并继续绘图 |
| `scripts/package.js`、`release.js` | v0.2.0 玩家包含 `tea.cmd`、`host.cmd`、`join.cmd`、`mcp.cmd`；按包版本生成清单及 SHA-256 |

启动锁与房间锁跨进程串行化并发请求。重复开本人同房或重复加入同房保留服务、epoch 和作品；省略房规参数时复用已有本人房规。其他房间返回 `ALREADY_IN_ROOM`，不会自动离开旧场。明确指定的 session 不存在时拒绝，模式/hub 不匹配时拒绝覆盖；邀请已过期时提示先明确结束旧场。Steam 失败不会自动降级 mock。

HTTP 请求超时不等于 Steam 的开房/加入操作已取消。服务从操作入队起公开连接进行中的状态，同时拒绝另一条开房、加入或离房请求；Agent 应读取状态，等待完成或失败后再决定下一步。服务关闭后，迟到的连接结果不能建立新画布或写入存档。

开房/加入的 Agent 结果不包含 UI 管理 token 或浏览器管理 URL。审核仍只能使用独立网页管理凭据；绘图凭据不能批准作品。安装来源来自用户认可的接入指引或本机配置，不从房间邀请码内取得。

## 验证与证据

| 验证 | 结果 |
| --- | --- |
| 单元与真实 CLI/MCP 子进程测试 | 71/71 通过，含无需 session 的 MCP 开房/加入、慢连接超时与重试保护、离房中拒绝返回旧邀请、取消、模式错配、测试进程清理及继承管道下的退出识别 |
| 一句话接入独立进程验收 | 9/9 通过；并发开房只起一个服务、完整分享句加入、绘图与人工审核同步、重复操作保留作品、异房拒绝；连接模式为 mock |
| 八个独立服务端点 | 7/7 通过，8 份批准作品同步；连接模式为 mock |
| 四个独立网页画布与手机布局 | 16/16 通过，审核、同步、导出、刷新、冻结及无外部请求；连接模式为 mock |
| 安装包验收 | 7/7 通过；SHA-256、缓存复用与篡改拒绝、便携 Node、开房/加入命令入口及 MCP 开房工具 |
| 静态引导页 | 10/10 通过；真实 Chrome 剪贴板、完整邀请句、复制回退、手机布局及无邀请上传 |
| 本机 Steam 原生大厅 | 当前阻塞：原生接口已加载，创建大厅报无法连接 Steam；不是代码/模拟测试通过的替代证明 |
| 真实便携包安装后开房 | 已校验安装、产生本机会话；已安装包 CLI 返回 `GenericFailure`，原因为无法连接 Steam。验证器另外等到管道关闭超时，不能把它解释为 CLI 没有响应；自身进程与私有目录已清理 |
| 不同账号的真实 Steam 两端 | 未执行：缺少第二个已登录不同 Steam 账号的执行端 |

[总验收报告](../ai-tea-draw/verification/report.json)、[单元测试 JUnit](../ai-tea-draw/verification/unit-tests.xml)、[一句话接入报告](../ai-tea-draw/verification/easy-connect/report.json)、[安装验收](../ai-tea-draw/verification/install/install-report.json)、[引导页验收](../ai-tea-draw/verification/site/report.json)、[当前 Steam 检查](../ai-tea-draw/verification/steam-single.json)。`report.json` 的 `partial` 表示 Steam 环境与跨账号验收仍有阻塞，不能标为真实互联网联机已验收。

[真实安装后开房记录](../ai-tea-draw/verification/steam-onboarding/report.json) 单独保存实际 Steam 错误和验证器限制，没有补造不同账号联机或进程退出时间的证明。

## 玩家包

| 包 | 字节 | 适用条件 |
| --- | ---: | --- |
| [lite](../ai-tea-draw/dist/ai-tea-draw-0.2.0-windows-x64-lite.zip) | 985,793 | 已有 Node ≥20 |
| [portable](../ai-tea-draw/dist/ai-tea-draw-0.2.0-windows-x64-portable.zip) | 36,168,949 | 自带 Node，不要求 npm 安装依赖 |

两个包均包含生产依赖与传输源码，不携带 Electron、Chrome 或 Playwright。精确哈希见 [release-manifest.json](../ai-tea-draw/dist/release-manifest.json)，公开部署步骤见 [DEPLOY.md](../ai-tea-draw/site/DEPLOY.md)。本轮没有创建 GitHub Release、发布 Pages 或改写永久 Agent 配置。
