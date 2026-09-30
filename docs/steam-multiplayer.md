# Steam 双人合作与全自动验证

游戏已接入本机 Node 桥接，原有 PeerJS 模式仍可选择。生成的运行时在忽略目录 `.steam-multiplayer/`，源代码与 skill 在独立子仓库 `steam-spacewar-multiplayer-skill/`。

首次恢复运行时，在子仓库中执行 `npm ci` 和 `npm run install:runtime`。之后从游戏根目录运行 `start-steam.cmd`；浏览器从桥接生成的同源 URL 打开，联机面板默认选择 Steam。默认 AppID 480，每端运行本机桥接、登录各自 Steam 账号。房主创建 FriendsOnly 大厅，客机用大厅号加入，房主在游戏大厅开局。

房主模拟权威世界。客机输入与面板命令通过桥接传输；金币、钥匙、武器、祝福各自归属。双方可以拾取、开箱、购物、合成、安装配件、拆解和回收。房主角色死亡后模拟继续，队友可推进；全员倒下才结束，换层复活。暂停与再来一局由房主控制，房主退出关闭会话。

```powershell
.\verify-multiplayer.cmd --mode local
.\verify-multiplayer.cmd --mode full
```

验证全程由脚本执行，无人工验收。输出 JSON、JUnit、Markdown、截图；退出码 0 通过、1 失败、2 环境阻塞。真实双账号自动化使用 `STEAM_PAIR_CONFIG` 指向两台自动化主机的 CDP 与本机桥接入口，详见子仓库 `references/automatic-verification.md`。

第二台异地机器无法远程执行时，使用同一份便携 ZIP，在当前机器双击 `verify-steam-host.cmd`，将它输出的完整私有配对码交给第二台。第二台登录另一个 Steam 账号后双击 `verify-steam-worker.cmd` 并输入配对码。两账号需要互为好友，两端需要 Chrome/Edge；不需要 SSH、开放端口或安装 Agent。浏览器、桥接、游戏操作与判定由本地脚本完成，结果经 Steam 自动汇总。登录、启动和输入配对码属于环境准备，无人工游戏验收。两端都不要同时启动普通游戏入口 `start-steam.cmd`。

当前覆盖双浏览器经模拟传输的合作行为、十二层地图/阶段跳转和共同结算。这些跳转是测试夹具，不表示机器人已经完整战胜十二层所有怪物。单端 Steam 原生与大厅已实际检查；两账号真实投递还缺独立自动化环境。没有把模拟结果计作真实 Steam 通过。

首版限制：双人、Windows x64、开局前加入、房主不迁移；客机位置按快照更新。本地预测、远端插值、远端音效事件和长期跨网压力测量尚未完成。

2026-09-30 分发快照：ZIP 的 SHA-256 为 `12deb35589f853746aba9d1ce831c6d61a0337ec914921961709607fdb61ee8d`。自动解压后通过 344 个文件校验、包内 Node、22 项组件/游戏逻辑测试、双浏览器和两端独立进程的各 21 项游戏检查、最小第二示例及 31 秒生命周期检查。原游戏五组回归、原生 WebRTC 冒烟及本地 PeerJS/WebRTC 的 22 项 E2E 检查也通过；这些本地结果仍不是异地 Steam 双账号通信证明。
