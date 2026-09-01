# 内网穿透联机环境配置指南（SakuraFrp）

> 依据官方文档《Web 应用穿透指南》(https://doc.natfrp.com/app/http.html) 整理，适配本项目的 P2P 联机信令服务器。

## 架构说明

```
玩家A(主机) ──WebRTC DataChannel(P2P，可走 STUN/TURN)──► 玩家B(客机)
     │                                                      │
     └──SakuraFrp TCP 隧道──► 信令服务器(本机:9000)──────────┘
          (仅交换 SDP/ICE，不转发游戏数据，不能代替 TURN)
```

## 第一步：启动本地信令服务器

```bash
cd server
npm install        # 首次需要（依赖 ws，不再使用 peerjs-server）
powershell -ExecutionPolicy Bypass -File start-server.ps1   # 弹出可见 cmd 窗口
```

自研信令服务器兼容 peerjs 1.5.4：

- HTTP `GET /yqks/peerjs/id` 分配 id（兼容 retrieveId；游戏客机已改为本地生成明确 Peer ID，不再依赖此接口也能加入）
- HTTP `GET /health` 查看端口与在线 peer
- WebSocket `/yqks/peerjs?id=&token=&key=peerjs` 转发 OFFER/ANSWER/CANDIDATE/LEAVE

验证：

- 浏览器访问 http://127.0.0.1:9000/health 应返回 `{"ok":true,"port":9000,...}`
- 浏览器访问 http://127.0.0.1:9000/yqks/peerjs/id 应返回一串随机字符

**隧道本地端口必须是 9000。** 若 SakuraFrp 仍指向 `127.0.0.1:25565`（Minecraft），公网入口永远打不到本信令，日志会写“目标端口可能未打开”。

## 第二步：SakuraFrp 创建 TCP 隧道

1. 打开 SakuraFrp 启动器并登录
2. 点击 **创建隧道**，按官方文档填写：

| 字段 | 值 | 说明 |
|---|---|---|
| 隧道类型 | **TCP** | 信令是 WebSocket，必须用 TCP（HTTP 隧道会干扰升级） |
| 本地 IP | 127.0.0.1 | 本机 |
| 本地端口 | **9000** | 必须是信令端口，不是 25565 |
| 远程端口 | 自定义 | 公网访问端口 |
| 穿透节点 | 任选（建议就近） | 免费节点即可 |

3. 创建后 **启动隧道**，记下公网地址（形如 `xxx.natfrp.cloud:19000`）

## 第三步：游戏内联机配置

1. 打开游戏（建议 `http://127.0.0.1` 静态服务，不要 `file://`）
2. 进入大厅，走到 **联机石碑** 按 E
3. 填写：
   - **信令服务器地址**：局域网 `127.0.0.1:9000`；跨网 `公网地址:端口`；国内节点 HTTPS 用 `wss://公网地址:端口`
   - **房间码**：主机点“创建房间”自动生成；客机输入同一房间码
4. 主机：创建房间 → 客机加入后状态为“客机已在大厅” → **返回大厅走传送门开局**（地图创建后才发 welcome）
5. 客机：加入后“等待主机开局”，主机进门后自动进入同一层

## 第四步：验证

- 主机 HUD 出现另一名玩家血条
- 客机看到自己的角色（快照 `p[1]`），主机角色在旁边（`p[0]`）
- 任一方断开，另一方提示“联机已断开”

## 常见问题

| 问题 | 解决 |
|---|---|
| 信令错误 network / 501 | 国内节点拦截明文 HTTP。隧道开自动 HTTPS，地址加 `wss://` |
| 创建房间失败 | 先开 `server` 并确认 /health；隧道本地端口必须 9000 |
| 客机 server-error | 旧 peerjs-server 0.2.9 没有 /id。当前客机使用本地随机 Peer ID，同时自研信令保留 /id |
| 客机一直等待开局 | 主机必须先创建房间，**再走传送门**（大厅 hello 不再带种子） |
| 开局后只剩 1 名玩家 | 已修复：`start({keepGuest:true})` 保留客机 |
| 客机镜头跟着主机跑 | 已修复：客机本地吃快照 `p[1]` |
| 局域网联机 | 地址填 `127.0.0.1:9000`，无需 SakuraFrp |
| 对称 NAT / 公司网连不上 | SakuraFrp TCP **不能**当 TURN。在控制台执行 `localStorage.setItem('yqks_turn', JSON.stringify({urls:'turn:你的TURN:3478',username:'u',credential:'p'}))` 后刷新 |

### 专项排查："信令错误：network"（501）

国内节点对明文 HTTP 强制拦截。修复：

1. 隧道启用“自动 HTTPS”（建议 `auto_https_mode = passthrough`）
2. 游戏地址加 `wss://` 前缀
3. 首次访问 `https://公网地址:端口` 接受自签证书

验证：`cd server && node test-public.js wss://公网地址:端口`，输出“✔ 信令握手成功”。

### 附：信令服务器管理

```bash
cd server
powershell -ExecutionPolicy Bypass -File start-server.ps1
node test-handshake.js
node test-relay.js
node _verify_new.js
```
