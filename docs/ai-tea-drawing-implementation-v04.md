# AI 茶绘 v0.4 实现与验收记录

记录日期：2026-10-05。应用源码为 `../ai-tea-draw/`，版本为 **0.4.0**。本文描述实际实现；详细设计另见 Astra xhigh 编写的 `ai-tea-drawing-games-tools-agent-plan-v04.md` 和 `ai-tea-drawing-svg-stream-plan-v04.md`。

本轮 Goal 包括两种游戏、基础矢量绘画工作台、Agent 视觉与技法上下文、有序 SVG 笔画流、轻量安装包和本地验收。公开发布与真实 Steam 多账号联机不属于已经完成的验收。

## 实际玩法

| 玩法 | 实际流程 | 信息与评分 |
| --- | --- | --- |
| 图文传话 | 每人发起一条链；并行写一句话、轮换画图、只看上一张图描述；全场结束揭晓 | 每人访问每条链一次；不提前公开文字或源 SVG；拒绝、断线、超时留空；双人局标为练习 |
| 你画我猜 | 轮流当画手，从固定词包的三个候选选词；默认三个画图、审核、猜测检查点，支持单检查点 | 猜者只接收批准的 PNG，每窗口一次猜测；精确归一化/别名匹配；猜中得 1 分，画手按有效猜者猜中比例得分；揭晓才公开答案、猜测与分数 |

默认中立主持人模式 `moderator-strict`，房主不参赛：传话至少另有 3 人，猜画至少另有 2 人。熟人模式 `participant-confirm` 允许房主参赛，提交表示本人确认内容。游戏开始后加入者为观众；暂停、重连会更新任务句柄，过期交卷被拒绝。

开始、审核、暂停、提前结束阶段、结束游戏只通过房主网页管理凭据执行。MCP/CLI 只获得玩家能力。严格审核绑定宿主实际渲染的 PNG 哈希，不信任客户端提供的图片。规则与权限在宿主执行，隐藏内容不会预先发给猜者再用 CSS 隐藏。私有草稿修改和猜测不会通过别人的版本号透露活动次数。

## 绘画与流式输出

新增「游戏与绘图」工作台，为原生 HTML/CSS/JS 浏览器页面。绘画以可编辑 SVG 树为事实源，编辑 ID 独立于规范 SVG 的渐变 ID。

- 画笔、钢笔曲线、矩形、椭圆、直线、对象橡皮、吸色；颜色、描边、线宽、透明度。
- 选择、多选、节点编辑、路径文本编辑；锁定、隐藏、图层排序及名称。
- 编组、解组、复制、删除、移动、旋转、缩放、同层对齐；撤销、重做。
- 导入 SVG，导出最终 SVG 和操作日志；游戏草稿绑定本人当前绘画任务。

节点拖动支持绝对 M/L/C/Q/Z 路径，其他合法路径可通过路径数据编辑。根节点样式继承、缩放组内拖动及解组保留样式已验证。组的整体透明度不足 100% 时解组会改变叠色，因此界面要求先调至 100%。

流式协议为完整 JSON 操作批次：`draftId + seq + baseRevision + operations`。支持 add/set/append/remove/move/duplicate/meta；宿主整批验证、事务提交、回传 revision/nextSeq/nodeIds。同序号同内容重试幂等，改内容冲突，旧版本与乱序拒绝。非法批次不改变文档或消耗序号。

CLI `stream --file -` 按 NDJSON 完整行即时发送，不等待 EOF，收到回执后发送下一批，约 550 ms 一批。断线后读取最新序号和版本可继续或显式重试。浏览器在确认批次后更新；人手绘画在本地拖动预览，松手提交完整笔画。游戏猜者只看到已批准的静态检查点 PNG。

每批最多 64 项、64 KiB；SVG 最多 256 KiB、2000 元素、12000 路径命令、16 层。隐藏节点同样受限。撤销历史最多 10 次、512 KiB；操作日志最多 1 MiB/1000 批，超额以新 initialRoot 压缩，并用 complete=false 明示逐笔历史不完整。最终 SVG 保留。

这不是监听模型 token 或直接拼接未闭合 XML。生产 Agent 必须主动及时写出完整行；预先写好的文件播放属于回放。压感、位图绘画、布尔擦除、蒙版、PSD 工作流尚未实现。

## Agent 接入与制衡

MCP 共 **31 个工具**；CLI 提供 game/draw/stream/agent-context 动作。玩家使用自己的模型与账号，应用不保存模型 API key，也不代为调用模型。

`agent_get_context` 提供规则、本人任务、获准图片、本人节点/版本以及最多三个 SVG 技法例子。MCP 图片通过原生 image 内容返回；CLI 可保存 PNG 预览。看图任务需要 Agent 的视觉能力。

技法包括基础示例及作者主动同意的小型 SVG 片段与说明。游戏固定共享池，禁止游戏中新增示例；作者可撤回后续读取。揭晓回放中的 SVG 仅本人或已同意分享的作者可见。猜者不能通过 context/export/read 获取未揭晓答案、别人的源 SVG 或操作流。没有读取模型的私有推理。

这一权限体系假设房主进程可信；本机宿主档案持有游戏原始数据，不提供针对被篡改宿主的密码学隐藏。技术检查也不等于内容审核，当前由主持人看图决定，尚未接入自动图片审核模型。评分分母依据发布检查点时在线或实际作答的猜者，没有独立图片接收 ACK。

## 安装与部署

保留一句话安装、开房、加入；已有 MCP 的 Agent 可调用：

```javascript
tea_create_room({gameMode:"telephone",reviewPolicy:"moderator-strict",maxMembers:4})
```

便携包内对应：

```powershell
tea.cmd setup --agent codex
tea.cmd host --game-mode telephone --review-policy moderator-strict --max-members 4
tea.cmd join --invite-file invite.txt
```

配置支持 Codex、Claude、Cursor、VS Code、Gemini；其他有工具调用或本机命令能力的 Agent 使用通用 MCP 配置或 CLI。安装器备份并合并配置，重复调用复用服务/房间；加入另一房间时要求先明确离开。

PNG 由随 Windows x64 包提供的 resvg 在独立、有时限的 Node 进程渲染。玩家无需 Chrome 自动化或 npm。lite 包约 **3.02 MiB**，需已有 Node；portable 包约 **36.57 MiB**，自带 Node，均不含 Electron。精确字节数与 SHA-256 以 `../ai-tea-draw/dist/release-manifest.json` 为准。

本次已验证的 lite 为 **3,166,854 字节**，portable 为 **38,350,035 字节**。两份 ZIP 的实际 SHA-256 与下载清单及安装验证报告一致。

GitHub Pages 可以托管静态首页、说明、安装入口；实际 Steam 联机仍需本机服务。网站和 Release **尚未公开发布**，清单仍为 local-build；没有提交、推送或公开上传本轮代码与安装包。

## 验收证据

- 自动化：**149/149** 测试通过，见 `../ai-tea-draw/verification/unit-tests.xml`。包含 46 项游戏状态/权限用例、流式幂等与回放、非法批次回滚、隔离 PNG、完整 stdin 行在 EOF 前到达、原生 MCP 图片、大 SVG 分块与深层文档、私有操作版本隔离。
- 多进程：8 个独立 mock 端点，CLI/MCP 子进程，31 个工具握手；私有提案、管理员隔离、发布后收敛与 SVG 导出通过。
- 浏览器：4 个独立本机服务/浏览器完整运行两种严格游戏；传话写、画、审核、描述、揭晓、回放和猜画轮流画手、计分通过。绘图、撤销、节点、继承样式、组内移动和解组验证通过；无浏览器运行错误。自由画布与手机界面回归通过。
- 安装包：ZIP SHA-256、解压、重复安装、篡改拒绝、配置合并、实际 MCP 握手、并发加入、便携 Node，以及 lite/portable 解压后的原生 PNG 渲染通过。测试未修改用户永久 Agent 配置。
- Steam 原生单端：初始化、App 访问、八席大厅与本人身份通过，见 `../ai-tea-draw/verification/steam-v04.json`。
- **真实不同 Steam 账号之间的联机未验收**，缺少第二个独立账号执行端。mock 成功不代表这项通过；汇总报告因此为 partial，见 `../ai-tea-draw/verification/report.json`。

可复现入口：在应用目录执行 `npm test` 和 `npm run verify`。截图位于 `../ai-tea-draw/verification/studio/`，包括 editor.png、telephone-replay.png、guess-window.png。安装包位于 `../ai-tea-draw/dist/`。

收尾说明：自动审批以“blocked by policy”拒绝测试存档目录清理。存档保留在 Git 忽略的 verification/studio/private-* 下，未进入安装包；本轮测试进程与房间服务已经关闭。
