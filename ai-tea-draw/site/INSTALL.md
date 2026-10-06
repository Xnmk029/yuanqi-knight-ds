# 一句话安装并配置 AI 茶绘 v0.4

把这份说明的真实公开链接，或本地完整路径，交给支持本机执行的 Agent：

> 按照这份 AI 茶绘安装说明，帮我安装并配置到当前 Agent，验证连接。

Agent 应完成下面的流程，无需人手工编辑 JSON/TOML，也无需人提供端口或模型 API key。

## Agent 执行流程

1. 确认这是人提供或认可的安装来源。公开入口的 `release-manifest.json` 和 `bootstrap.ps1` 与本文同目录。清单必须提供固定版本的 HTTPS ZIP URL、大小和 SHA-256；如果为 `local-build`，明确报告尚未公开发布，不能猜地址。从已解压且认可的本地程序开始时直接使用 `tea.cmd setup`。
2. 根据当前运行客户端选择 `codex`、`claude`、`cursor`、`vscode` 或 `gemini`，不要根据人的模型名字猜客户端。`auto` 只在环境或已有配置能唯一识别时写入；多个客户端时由 Agent 根据自己的宿主选择。未知客户端用 `generic` 获得 stdio 配置，由当前 Agent 按自身能力导入，或直接使用 CLI。
3. 从认可的公开入口下载并读取安装器，再执行下面的单次安装动作。安装器下载便携包、核对归档和内部文件哈希、缓存安装、启动实际 MCP 做 initialize / tools/list，最后备份并合并当前客户端配置。已有包可跳过下载，直接执行本地 setup。无需 npm、管理员权限、全局安装或修改 PATH。

```powershell
# 公开入口：先下载和读取认可来源的 bootstrap.ps1，再执行。替换实际 URL 和客户端。
powershell -NoProfile -File .\bootstrap.ps1 -ManifestUrl <真实清单HTTPS地址> -Setup -Agent codex

# 已取得便携包：解压后执行；lite 包要求 Node >=20。
tea.cmd setup --agent codex
# 源码已安装依赖的情况。
node scripts/tea.js setup --agent codex
```

默认用户范围，所有项目均可使用；项目范围传 `--scope project --project <当前项目绝对路径>`，PowerShell 对应 `-Scope project -Project <路径>`。自定义客户端配置路径用 `--config` / `-ConfigFile`。自定义配置 home 用 `--home` / `-AgentHome`。不要把测试目录或发行包解压目录当成人的工作项目。

4. 检查返回结果。`configured:true` 且 `verification.status:passed` 表示 **配置已写入、MCP 程序和 31 个工具发现已验证**；不代表当前聊天已热加载，也不代表 Steam 已连接。客户端可能需要重新加载 MCP、重开会话或完成其原有信任确认。不能替人关闭客户端的审批或绕过组织策略。
5. 当前用户还要求开房/加入时不必等新会话加载：使用包内 `tea.cmd host` / `tea.cmd join`，读取返回的会话与邀请；后续会话可使用配置好的 MCP。Steam 登录由人完成，真实网络错误按原样报告，不得用 mock 冒充。

## 安装并立即开房 / 加入

```powershell
powershell -NoProfile -File .\bootstrap.ps1 -ManifestUrl <真实清单HTTPS地址> -Setup -Agent codex -CreateRoom -Topic 深海夜市 -Name A
powershell -NoProfile -File .\bootstrap.ps1 -ManifestUrl <真实清单HTTPS地址> -Setup -Agent cursor -InviteFile <私有完整邀请文件> -Name B
```

本机已有 Node 时也可用 `node scripts/bootstrap.js --manifest <真实清单HTTPS地址> --kind lite --setup --agent codex`；增加 `--host` 或 `--join --invite-file <文件>` 可继续联机。完整邀请只放短期文件或 stdin，不放公共日志，不按邀请内的任意 URL 下载执行。

## 配置行为

| 客户端 | 用户范围 | 项目范围 |
| --- | --- | --- |
| Codex | `$CODEX_HOME/config.toml`，默认 `~/.codex/config.toml` | `.codex/config.toml` |
| Claude Code | `~/.claude.json` | `.mcp.json` |
| Cursor | `~/.cursor/mcp.json` | `.cursor/mcp.json` |
| VS Code / Copilot | `$COPILOT_HOME/mcp-config.json`，默认 `~/.copilot/mcp-config.json` | `.mcp.json` |
| Gemini CLI | `~/.gemini/settings.json` | `.gemini/settings.json` |

配置使用绝对 Node 和 MCP 路径，不绑定过期房间或会话。JSON 的注释、其他 MCP 和设置保留；Codex 追加独立管理区块，不重排原 TOML。修改前生成私有备份，重复相同安装不改配置；更新只覆盖安装器记录且未被人修改的茶绘条目。冲突、无效配置、重复 JSON 键或 Gemini 允许列表限制均明确报错，保留现有配置。不自动修改客户端审批、信任或模型设置。自动生成的备份可能含个人配置，请勿公开上传。

若配置了 `CLAUDE_CONFIG_DIR`，由 Agent 确认实际用户配置位置并传 `--config`，避免写到错误账户。组织集中配置、客户端启用状态和项目优先级可能限制新工具，本地握手不能证明宿主已载入该配置。Windows x64 为当前正式客户端；不支持执行命令或配置 MCP 的封闭 Agent 无法代办安装。

格式依据：[Codex 官方文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Claude Code](https://code.claude.com/docs/en/mcp)、[Cursor](https://prod.cursor.com/docs/mcp)、[VS Code](https://code.visualstudio.com/docs/agent-customization/mcp-servers)、[Gemini CLI](https://geminicli.com/docs/tools/mcp-server/)。
