# AI 茶绘 v0.3：一句话安装与配置

实现日期：2026-10-05，Asia/Shanghai。

用户把实际安装说明的公开链接或本地完整路径交给 Agent，说：

> 按照这份 AI 茶绘安装说明，帮我安装并配置到当前 Agent，验证连接。

Agent 可用一条安装器动作完成包下载与校验、缓存安装、当前客户端的配置合并和 MCP 验证。已取得便携包时执行 `tea.cmd setup --agent <当前客户端>`。用户无需手动编辑配置、管理端口、安装 npm 或提供模型 API key。

## 已实现

- Codex、Claude Code、Cursor、VS Code / Copilot、Gemini CLI 的用户/项目配置适配；通用 stdio 导出兼容其他可配置 MCP 的 Agent。
- `auto` 优先识别活动 Agent；无法唯一识别时返回通用配置与明确说明，由 Agent 根据自身宿主选择，不向多个客户端同时安装。
- 使用程序和 Node 的绝对路径，不绑定临时房间。便携包直接使用自带 Node，lite 包使用当前 Node >=20。
- 修改前备份，保留其他 MCP、JSON 注释和原 TOML；相同配置重复调用复用。更新只覆盖安装器记录且未被人修改的条目；冲突、无效 JSON/TOML、重复 JSON 键、用户修改和客户端允许列表限制均保留原设置并报错。
- 先用实际 MCP 子进程验证 initialize 和 tools/list，通过后才写配置。并发锁防止互相覆盖；死亡进程锁可恢复，连接检查期间其他程序改配置会停止写入。
- PowerShell `-Setup -Agent ...` 与 Node bootstrap `--setup --agent ...`。可在同次安装配置后立即开房/加入；联机失败仍返回已完成配置的证据。
- `setup.cmd`、`tea setup`、源码 `npm run setup`。默认安装动作不需要 Steam 上线；后续实际开房/加入才检查 Steam。
- 静态页面新增复制安装指令，安装说明 `INSTALL.md` 与原开房/加入流程共存。复制失败显示可选文本，手机 390px 下无横向溢出。
- 准备了手动 GitHub Actions 发布模板，生成固定版本 Release、部署 Pages，再下载校验真实公开入口。已有版本拒绝覆盖，私有仓库拒绝作玩家分发源。未运行远端工作流。
- 生产依赖 ws 更新至 8.22.0，生产依赖审计无已知漏洞；新增配置解析依赖随包提供，玩家无需 npm。

## 验证

| 验证项 | 结果 |
| --- | --- |
| 单元、CLI/MCP 子进程、安全和联机回归 | 87 / 87 通过 |
| 包校验、缓存防篡改、安装、配置、实际 MCP 握手 | 11 / 11 通过 |
| 实际 Codex CLI 读取生成的配置 | 通过，隔离 CODEX_HOME，未改原用户配置 |
| 其他四种客户端格式 | 合并、重复、升级与冲突测试通过；未在它们的实际宿主中验收 |
| 模拟 A 开房、B 加入、重试与场景保留 | 9 / 9 通过 |
| 八个独立服务进程 | 7 / 7 通过 |
| 四个独立浏览器画布与手机操作 | 16 / 16 通过 |
| 静态入口、安装按钮、剪贴板、手机布局 | 12 / 12 通过 |
| 发布模板 | YAML 与 PowerShell 语法通过；远端未执行 |
| 公开下载入口 | 未发布，清单仍为 local-build |
| 真实跨账号 Steam | 未执行，本次配置工作未重跑 Steam 原生检查 |

`configured:true` 和 `verification.status:passed` 只证明本地配置与 MCP 握手成功。客户端可能仍需重新加载工具、重开会话或完成其自身的信任确认。当前聊天可直接用 CLI 完成开房/加入，不依赖热加载。程序不会改客户端审批、模型设置或组织策略；Steam 登录由用户完成。

## 交付位置

- `ai-tea-draw/INSTALL.md`：用户与 Agent 的安装指引。
- `ai-tea-draw/src/agent-setup.js`：客户端配置、备份与 MCP 验证。
- `ai-tea-draw/scripts/setup.js` / `onboard.js`：独立配置及安装后继续联机入口。
- `ai-tea-draw/site/publish-to-github.yml`：手动发布模板；接入步骤见 `site/DEPLOY.md`。
- `ai-tea-draw/dist/ai-tea-draw-0.3.0-windows-x64-lite.zip` 与 `portable.zip`：新玩家包，具体大小和 SHA-256 见同目录清单。
- `ai-tea-draw/verification/report.json`：本版本汇总；测试配置与后台进程已清理。

未提交、推送、创建远端 Release 或更改现有仓库的 Pages/可见性。当前可用本地指引与玩家包完成配置；外部玩家从一句话直接下载的流程，仍需要选定公开发布仓库并运行准备好的发布流程。
