# 内网穿透联机环境配置指南（SakuraFrp）

> 依据官方文档《Web 应用穿透指南》(https://doc.natfrp.com/app/http.html) 整理，适配本项目的 P2P 联机信令服务器。

## 架构说明

```
玩家A(主机) ──WebRTC DataChannel(P2P)──► 玩家B(客机)
     │                                      │
     └──SakuraFrp TCP 隧道──► 信令服务器(本机:9000)──┘
          (仅交换 SDP/ICE，不转发游戏数据)
```

## 第一步：启动本地信令服务器

```bash
cd server
npm install        # 首次需要
powershell -ExecutionPolicy Bypass -File start-server.ps1   # 弹出可见 cmd 窗口，实时显示日志
```

> **自研信令服务器**（2026-09-01 重写）：兼容 peerjs 1.5.4 完整协议——
> - HTTP `GET /yqks/peerjs/id` 分配 id（修复客机 "server error"：旧 peerjs-server 0.2.9 缺少此路由，客机 retrieveId 失败）
> - WebSocket 信令转发（OFFER/ANSWER/CANDIDATE/LEAVE）+ 心跳忽略
> - 所有连接/转发/错误实时输出到 cmd 窗口

验证：浏览器访问 http://127.0.0.1:9000/yqks/peerjs/id 应返回一串随机字符。
当前状态：信令服务器已在可见 cmd 窗口运行（端口 9000）。

## 第二步：SakuraFrp 创建 TCP 隧道## 第二步：SakuraFrp 创建 TCP 隧道

1. 打开 SakuraFrp 启动器（SakuraLauncher.exe，本机已安装于 C:\Program Files\SakuraFrpLauncher\）并登录
2. 点击 **创建隧道**，按官方文档填写：

| 字段 | 值 | 说明 |
|---|---|---|
| 隧道类型 | **TCP** | 信令是 WebSocket，必须用 TCP 隧道（HTTP 隧道会干扰 WebSocket 升级） |
| 本地 IP | 127.0.0.1 | 本机 |
| 本地端口 | **9000** | 信令服务器端口 |
| 远程端口 | 自定义（如 19000） | 公网访问端口，免费用户可选范围以启动器提示为准 |
| 穿透节点 | 任选（建议就近） | 免费节点即可 |

3. 创建后点击 **启动隧道**，等待状态变为"运行中"
4. 记下启动器显示的 **公网地址**（形如 xxx.natfrp.cloud:19000 或 IP:端口）

> 官方文档提示：TCP 隧道远程端口为自定义端口，访问方式为 `http(s)://公网地址:远程端口`。

## 第三步：游戏内联机配置

1. 打开游戏（index.html），进入大厅
2. 走到 **联机石碑** 按 E
3. 填写：
   - **信令服务器地址**：`公网地址:远程端口`（如 `xxx.natfrp.cloud:19000`）
   - **房间码**：主机点"创建房间"自动生成 6 位码；客机输入主机房间码
4. 主机：点 **创建房间（主机）** → 状态显示"房间已创建" → 返回大厅 → 传送门开局
5. 客机：点 **加入房间（客机）** → 状态显示"已连接，等待主机开局" → 主机开局后自动进入

## 第四步：验证

- 主机 HUD 右下角出现 **P2 客机玩家血条**，说明客机已加入
- 客机视角：主机玩家/敌人/子弹由快照驱动，可正常战斗
- 断开：任一方点"断开"或关闭页面，另一方收到"联机已断开"提示

## 常见问题

| 问题 | 解决 |
|---|---|
| **报错"信令错误：network"** | 几乎都是**隧道类型错误**：HTTP 隧道对 WebSocket 返回 501。必须使用 **TCP 隧道**（见下方专项排查） |
| 创建房间提示"信令错误" | 检查服务器地址格式（host:port），确认信令服务器已启动、隧道已运行 |
| 客机加入后一直"等待主机开局" | 主机需先创建房间并保持大厅，再走传送门开局 |
| 局域网内联机 | 服务器地址填 `127.0.0.1:9000` 即可（无需 SakuraFrp） |
| 防火墙拦截 | 放行 node.exe 或 9000 端口入站 |
| 隧道启动失败 | 检查 SakuraFrp 启动器登录状态、实名认证、节点可用性 |

### 专项排查："信令错误：network"（501）

**症状**：游戏内创建/加入房间报"信令错误：network"，公网地址 TCP 能连通但 WebSocket 握手返回 501。

**根因（2026-09-01 实测确认）**：SakuraFrp **国内节点对明文 HTTP 流量强制拦截**（机房合规要求）。501 页面原文："您正试图使用 HTTP 协议访问此隧道……请使用 HTTPS 访问"。WebSocket 升级请求属于 HTTP 协议，被节点拦截层返回 501。

**修复**（两步）：

1. **隧道启用"自动 HTTPS"**（SakuraFrp 启动器 → 编辑隧道 → 找到"自动 HTTPS"选项并启用，建议高级配置中 `auto_https_mode = passthrough` 避免 frpc 改写 WebSocket 流量）→ 重启隧道。frpc 会生成自签证书并用 TLS 接受对外连接，脱壳后明文连接本地 9000（信令服务器无需改动）
2. **游戏内联机地址加 `wss://` 前缀**：`wss://frp-off.com:44330`（net.js 已支持协议前缀自动识别）

**浏览器证书提示**：自动 HTTPS 使用 frpc 自签证书，浏览器会拦截 wss 连接。首次使用前请访问 `https://frp-off.com:44330` 并点击"继续访问"接受证书（或把证书安装到系统信任库）。

**验证**：`cd server && node test-public.js wss://frp-off.com:44330`，输出"✔ 信令握手成功"即隧道正常。

**参考**：SakuraFrp 官方文档《配置 frpc 的自动 HTTPS 功能》(https://doc.natfrp.com/frpc/auto-https.html) —— 速查表："应用的 HTTP API（国内节点）✔️必须"。

### 附：信令服务器管理

```bash
cd server
powershell -ExecutionPolicy Bypass -File start-server.ps1   # 启动（写 PID 到 server.pid）
taskkill /PID (Get-Content server.pid) /F                    # 停止
Get-Content server.log                                      # 查看日志
```
