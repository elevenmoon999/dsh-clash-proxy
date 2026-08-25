# dsh-clash-proxy

<h1 align="center">⚠️ 本插件完全由 AI 生成 ⚠️</h1>

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）使用的**智能分流代理插件**：**完全自包含**——不依赖外部 Clash/mihomo 客户端，仅靠内置规则引擎 + 订阅节点，让 Harness 进程环境内国内流量直连、国外流量走订阅节点，两边都流畅；系统其他程序完全不受影响。

## 特性

- **自包含、零外部依赖**：主体纯 JavaScript 实现（`node:net` / `node:tls` / `node:crypto`）；`hysteria2` 与 `vless reality` 经内置 Go 原生连接器（见「原生连接器」），不依赖外部 mihomo 等程序，安装即用
- **自研规则引擎**：内置国内域名后缀表（11 万条压缩至 467KB）与国内 IP 段（IPv4/IPv6，约 8.7K 条），加上订阅自带规则与自定义规则，`DOMAIN` / `DOMAIN-SUFFIX` / `DOMAIN-KEYWORD` / `IP-CIDR` / `REJECT` 全部支持
- **订阅解析**：支持完整 Clash 配置、裸节点列表、base64 包裹，节点分组
- **节点协议**（国外流量出口）：
  - ✅ `socks5` / `http` 上游代理
  - ✅ `ss`（shadowsocks AEAD：aes-128-gcm / aes-256-gcm / chacha20-ietf-poly1305）
  - ✅ `trojan`（tcp / tls / ws）
  - ✅ `vless`（tcp / tls / ws）
  - ✅ `vless` reality（xtls-rprx-vision + reality-opts，经原生连接器）
  - ✅ `vmess`（AEAD alterId=0，tcp / ws，AES-128-GCM）
  - ✅ `hysteria2`（QUIC，经原生连接器）
  - ❌ `tuic`（QUIC 变体，暂未实现）
- **单端口双协议**：HTTP CONNECT + SOCKS5 共用一个回环端口，兼容 curl、Node、几乎所有代理客户端
- **仅限 Harness 环境**：
  - 监听 `127.0.0.1`，不碰系统代理、不开 TUN
  - DSH 派生的子进程（pwsh/terminal、jobs、workflow）经环境变量继承代理
  - DSH 自身 `fetch`（联网搜索、LLM、MCP）经运行时调度器走代理
  - 回环地址强制绕过（NO_PROXY），无代理环
- **原生 Web GUI**：设置 → Clash 代理：状态、启停、订阅更新、节点列表、逐节点测速、组选择、实时流量
- **节点选择**：`url-test`（自动最快）/ `select`（手动）/ `fallback`，手动选择持久化
- **自动更新订阅**：可配置间隔（小时），0 关闭

## 安装

```powershell
dsh plugin --profile web add dsh-clash-proxy
# 或本地路径 / git 仓库：
dsh plugin --profile web add <path/to/dsh-clash-proxy>
```

重启 DSH（`dsh web`），打开 **设置 → Clash 代理**，填入订阅地址即可。**无需任何其他软件。**

## 配置

设置页「Clash 代理」卡片（或 profile 补丁覆盖层）：

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关；关闭时不监听、不注入 |
| `subscriptionUrl` | 空 | Clash 订阅地址；也可用环境变量 `CLASH_SUBSCRIPTION_URL` |
| `fetchProxyUrl` | 空 | 抓取订阅本身可选的上游代理（订阅被墙时用） |
| `autoUpdateHours` | `24` | 订阅自动更新间隔（小时），`0` 关闭 |
| `groupType` | `url-test` | 自动组类型：`url-test` / `select` / `fallback` |
| `latencyTestUrl` | gstatic 204 | 节点健康检查与测速 URL |
| `latencyTimeoutMs` | `3000` | 测速超时（毫秒） |
| `noProxy` | 回环地址 | 追加 NO_PROXY 条目（回环永远强制绕过） |
| `extraRules` | `[]` | 追加规则，如 `DOMAIN-SUFFIX,example.com,DIRECT` |
| `excludeRules` | `[]` | 从订阅规则剔除（子串匹配） |

数据目录：`$DSH_HOME/clash-proxy/`（订阅缓存与选择状态）。分流数据内嵌于包中（`lib/core/data/*.json.gz`），离线可用；`npm run build:cn-data` 可重新生成。

## 工作原理

```
DSH 进程树
 ├─ DSH 自身 fetch ──(运行时调度器)──┐
 ├─ pwsh / terminal / jobs ─(环境变量)┤
 └─ workflow / subagent ───(继承 env)┘
                                    ▼
                    规则代理 (127.0.0.1:随机端口)
                      ├─ 国内域名/IP → 直连（快）
                      └─ 国外 → 订阅节点 (ss/trojan/vless/vmess/hysteria2/socks5/http)
系统其他程序 ── 完全无感（不碰系统代理/TUN）
```

- 每连接按规则引擎决策 `direct` / `proxy` / `reject`
- 管理页通过 DSH webserver 的 `/clash-proxy/*` JSON 接口访问
- 插件停用/卸载时恢复环境变量与 fetch 调度器，无残留
- 每个 DSH 进程随机端口，多实例互不冲突

插件复用 DSH 的以下能力（不自造轮子）：

| DSH 能力 | 复用方式 |
|---|---|
| `timer` 服务 | 订阅自动更新 + 定时全量测速循环 |
| `webServer` 服务 | 注册 `/clash-proxy/*` 前缀路由，浏览器轮询 JSON API |
| 设置系统（`dsh-settings`） | `installSettingsSection` 注册可编辑设置卡片，与浏览器共享同一份配置 |
| 客户端 `slots` / `locale` / `settingsScope` | 在「设置」页挂载管理面板，注册中英双语词典 |
| 运行时 fetch 调度器 | 注入 dispatcher，DSH 自身联网（搜索/LLM/MCP）走代理 |
| 环境变量注入 | 派生子进程（pwsh/jobs/workflow）继承 `HTTP(S)_PROXY` |

## 使用与验证

**使用示例**（在 DSH 内执行）：

```bash
curl -x http://127.0.0.1:<代理端口> https://ipinfo.io   # 看到国外出口 IP
curl https://www.baidu.com                              # 国内直连，秒开
```

**验证情况**（分层）：

- ✅ **已验**：
  - 规则引擎 / 订阅解析 / SS AEAD（`test/smoke.mjs`）
  - vmess(ws)、trojan(ws+tls)、vless(ws) 端到端（本地 xray oracle）
  - hysteria2 / vless-reality 经真实节点人工验证（验证脚本含真实凭据，未随仓库发布）
  - 真实分流 + socks5/ss 节点 + curl 实测（`test/proxy-e2e.mjs`）
- ⏳ **待验**（发布前建议补）：
  - 全新 profile 安装冒烟（`dsh plugin add` 后首次启动）
  - `npm pack --dry-run` 产物完整性（确认 `lib/native/connector.exe` 与 `cordis.patch.yml` 入包）
  - 多实例随机端口互不冲突

## 开发与测试

```bash
npm install
npm run build:cn-data              # 重新生成国内分流数据（需要国际网络）
node test/smoke.mjs                # 规则引擎/订阅/SS 加密帧 单测
node test/vmess-e2e.mjs            # vmess(ws) 端到端（本地 xray 服务器）
node test/trojan-ws-echo.mjs       # trojan(ws+tls) 端到端（本地 xray 服务器）
node test/vless-ws-echo.mjs        # vless(ws) 端到端（本地 xray 服务器）
node test/proxy-e2e.mjs            # 端到端：真实分流 + socks5/ss 节点 + curl 实测
```

端到端测试内置 socks5/ss 协议夹具服务器；vmess/trojan/vless 测试需要 `.clash-test/xray/xray.exe`（本地 oracle 服务器）。设 `TEST_UPSTREAM_PROXY=http://127.0.0.1:7890` 可让夹具链路借道任意 HTTP 代理访问国际网络（仅测试用）。

### 原生连接器

hysteria2（QUIC）与 vless reality（uTLS 指纹）在纯 JS 中无法实现，插件自带一个自编译的 Go 原生连接器 `lib/native/connector.exe`（源码在 `native/`，`go build -o ../lib/native/connector.exe .` 重新构建），Node 通过 stdio 与其桥接。它只做这两种协议的「拨号 + 双向转发」，规则引擎、订阅、节点选择仍在纯 JS 侧，**不依赖任何外部 Clash/mihomo 程序**。

## 常见问题

- **状态「缺少订阅」**：填 `subscriptionUrl`（或设 `CLASH_SUBSCRIPTION_URL`）后点「更新订阅」。
- **订阅更新失败**：订阅本身可能需要代理访问，把 `fetchProxyUrl` 填上。
- **节点连不上**：确认节点类型是 `ss`/`trojan`/`vless`/`vmess`/`hysteria2`/`socks5`/`http`（GUI 节点列表可见类型）；`tuic` 暂不支持。
- **验证分流**：DSH 里跑 `curl -x http://127.0.0.1:<端口> ipinfo.io` 看出国 IP；访问百度应秒开。
- **和已有 Clash 客户端共存**：完全独立、随机端口，互不干扰。

## 已知限制

| 限制 | 原因 | 缓解方案 |
|---|---|---|
| `hysteria2` / `vless-reality` 依赖内置 Go 连接器（Windows amd64 二进制） | QUIC / uTLS 指纹无法在纯 JS 实现 | 其他平台/架构用 `native/` 源码执行 `go build -o ../lib/native/connector.exe .` 重新编译 |
| `tuic` 暂不支持 | 另一 QUIC 变体，未实现 | GUI 选择 `ss`/`trojan`/`vless`/`vmess`/`hysteria2`/`socks5`/`http` 节点 |
| 部分节点对 google / wikipedia / x.com 出口不稳定（实测有超时） | 取决于订阅节点出口线路 | GUI 逐节点「测速」后换用更稳的节点 |
| 只作用于 Harness 进程树，不修改系统代理 | 设计如此（安全边界） | 需要系统级代理请另配系统工具 |
| 纯 JS 传输极高并发下吞吐有限 | `node:net` / `node:tls` 事件循环模型 | 国内流量已直连；国外按需使用 |

## 更新日志

- **0.2.0** — 支持 `ss` / `trojan` / `vless`(tcp/tls/ws) / `vmess` / `socks5` / `http` 纯 JS 传输；新增 `hysteria2` 与 `vless-reality`（内置 Go 原生连接器）；Web GUI（状态/订阅更新/节点列表/测速/选择/流量）；规则引擎 + 国内分流数据 + 订阅解析。

## 协议与合规

MIT 协议。本插件仅提供技术能力，请确保你的代理服务与使用方式符合当地法律法规。
