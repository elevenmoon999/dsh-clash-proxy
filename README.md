# dsh-clash-proxy

<h1 align="center">⚠️ This plugin is entirely AI-generated ⚠️</h1>

A **self-contained rule-splitting proxy** plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). No external Clash/mihomo client: a built-in rule engine plus your subscription nodes give the Harness process tree smooth access to both domestic (direct) and international (proxied) networks — while the rest of your system is untouched.

## Features

- **Self-contained, zero external dependencies** — mostly pure JavaScript over `node:net` / `node:tls` / `node:crypto`; `hysteria2` and `vless reality` go through a bundled Go native connector (see "Native connector" below)
- **Built-in rule engine** — embedded domestic domain suffixes (~110K entries, 467KB gzipped) and domestic IP ranges (IPv4/IPv6), plus subscription rules and custom `DOMAIN` / `DOMAIN-SUFFIX` / `DOMAIN-KEYWORD` / `IP-CIDR` / `REJECT` rules
- **Subscription parsing** — full Clash configs, bare node lists, base64 bodies, node groups
- **Node transports** (international egress):
  - ✅ `socks5` / `http` upstream proxies
  - ✅ `ss` (shadowsocks AEAD: aes-128-gcm / aes-256-gcm / chacha20-ietf-poly1305)
  - ✅ `trojan` (tcp / tls / ws)
  - ✅ `vless` (tcp / tls / ws)
  - ✅ `vless` reality (xtls-rprx-vision + reality-opts, via the native connector)
  - ✅ `vmess` (AEAD alterId=0, tcp / ws, AES-128-GCM)
  - ✅ `hysteria2` (QUIC, via the native connector)
  - ❌ `tuic` (QUIC variant, not implemented)
- **One port, two protocols** — HTTP CONNECT + SOCKS5 on a single loopback port
- **Harness-only scope**:
  - Listens on `127.0.0.1`, no system proxy, no TUN
  - DSH subprocesses (pwsh/terminal, jobs, workflows) inherit the proxy via env vars
  - DSH's own `fetch` (web search, LLM, MCP) is routed through a runtime dispatcher
  - Loopback always bypasses (NO_PROXY) — no proxy loops
- **Native Web GUI** — Settings → Clash Proxy: status, enable/restart, subscription update, node list, per-node latency tests, group selection, live traffic
- **Node selection** — `url-test` (auto-fastest) / `select` (manual, persisted) / `fallback`
- **Auto subscription refresh** — configurable interval in hours, 0 disables

## Install

```powershell
dsh plugin --profile web add dsh-clash-proxy
# or from a local path / git repo:
dsh plugin --profile web add <path/to/dsh-clash-proxy>
```

Restart DSH (`dsh web`), open **Settings → Clash Proxy**, and fill in your subscription URL. Nothing else is needed.

## Configuration

The Clash Proxy settings card (or a profile patch overlay):

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch; nothing listens or is injected when false |
| `subscriptionUrl` | empty | Clash subscription URL; `CLASH_SUBSCRIPTION_URL` env var also works |
| `fetchProxyUrl` | empty | Optional upstream proxy for fetching the subscription itself |
| `autoUpdateHours` | `24` | Subscription refresh interval in hours, `0` disables |
| `groupType` | `url-test` | Auto group type: `url-test` / `select` / `fallback` |
| `latencyTestUrl` | gstatic 204 | Node health-check / latency-test URL |
| `latencyTimeoutMs` | `3000` | Per-node latency test timeout |
| `noProxy` | loopback | Extra NO_PROXY entries (loopback is always forced) |
| `extraRules` | `[]` | Extra rule lines, e.g. `DOMAIN-SUFFIX,example.com,DIRECT` |
| `excludeRules` | `[]` | Subscription rules to drop (substring match) |

Data directory: `$DSH_HOME/clash-proxy/` (subscription cache, selection state). Routing data ships inside the package (`lib/core/data/*.json.gz`) and works offline; rebuild it with `npm run build:cn-data`.

## How it works

```
DSH process tree
 ├─ DSH's own fetch ──(runtime dispatcher)─┐
 ├─ pwsh / terminal / jobs ──(env vars)────┤
 └─ workflow / subagents ───(inherited)────┘
                                           ▼
                        rule proxy (127.0.0.1:random port)
                          ├─ domestic domains/IPs → direct (fast)
                          └─ foreign → subscription node (ss/trojan/vless/vmess/hysteria2/socks5/http)
Other system programs ── unaffected (no system proxy / TUN)
```

- Every connection is decided per-target: `direct` / `proxy` / `reject`
- The GUI talks to the manager through the DSH webserver's `/clash-proxy/*` JSON API
- Disabling/uninstalling restores env vars and the fetch dispatcher — no leftovers
- Per-process random ports; multiple DSH instances never collide

The plugin reuses these DSH capabilities (no reinvented wheels):

| DSH capability | How it is reused |
|---|---|
| `timer` service | Subscription auto-update + periodic full latency-test loop |
| `webServer` service | Registers the `/clash-proxy/*` prefix route for the browser's JSON API |
| Settings system (`dsh-settings`) | `installSettingsSection` mounts an editable settings card shared with the browser |
| Client `slots` / `locale` / `settingsScope` | Mounts the management panel into Settings; registers EN/ZH dictionaries |
| Runtime fetch dispatcher | Injects a dispatcher so DSH's own fetch (search/LLM/MCP) goes through the proxy |
| Environment injection | Spawned subprocesses (pwsh/jobs/workflow) inherit `HTTP(S)_PROXY` |

## Usage & verification

**Usage example** (run inside DSH):

```bash
curl -x http://127.0.0.1:<proxy-port> https://ipinfo.io   # see the foreign exit IP
curl https://www.baidu.com                                # domestic direct, instant
```

**Verification status** (layered):

- ✅ **Verified**:
  - Rule engine / subscription parsing / SS AEAD (`test/smoke.mjs`)
  - vmess(ws), trojan(ws+tls), vless(ws) end-to-end (local xray oracle)
  - hysteria2 / vless-reality manually verified against real nodes (script not published to avoid leaking credentials)
  - Real splitting + socks5/ss nodes via curl (`test/proxy-e2e.mjs`)
- ⏳ **To verify** (recommended before publish):
  - Fresh-profile install smoke test (`dsh plugin add` then first boot)
  - `npm pack --dry-run` package completeness (confirm `lib/native/connector.exe` and `cordis.patch.yml` are included)
  - Multi-instance random ports never collide

## Development & tests

```bash
npm install
npm run build:cn-data              # regenerate CN routing data (needs internet)
node test/smoke.mjs                # rule engine / subscription / SS AEAD unit tests
node test/vmess-e2e.mjs            # vmess(ws) end-to-end (local xray server)
node test/trojan-ws-echo.mjs       # trojan(ws+tls) end-to-end (local xray server)
node test/vless-ws-echo.mjs        # vless(ws) end-to-end (local xray server)
node test/proxy-e2e.mjs            # end-to-end: real splitting + socks5/ss nodes via curl
```

The E2E tests ship minimal socks5/ss protocol fixtures; the vmess/trojan/vless tests need `.clash-test/xray/xray.exe` (a local oracle server). Set `TEST_UPSTREAM_PROXY=http://127.0.0.1:7890` to let the fixture path reach the international internet through any HTTP proxy (test-only convenience).

### Native connector

`hysteria2` (QUIC) and `vless reality` (uTLS fingerprint) cannot be implemented in pure JavaScript, so the plugin ships a self-compiled Go native connector `lib/native/connector.exe` (source in `native/`, rebuild with `go build -o ../lib/native/connector.exe .`). Node bridges to it over stdio. It only does "dial + bidirectional relay" for those two protocols; the rule engine, subscription parsing, and node selection stay on the pure-JS side, with **no dependency on any external Clash/mihomo binary**.

## FAQ

- **"No subscription"** — fill `subscriptionUrl` (or set `CLASH_SUBSCRIPTION_URL`) and click "Update subscription".
- **Subscription update fails** — the subscription may itself need a proxy; set `fetchProxyUrl`.
- **Nodes won't connect** — check the node type in the GUI; `ss` / `trojan` / `vless` / `vmess` / `hysteria2` / `socks5` / `http` are supported, `tuic` is not.
- **Verify splitting** — inside DSH run `curl -x http://127.0.0.1:<port> ipinfo.io` to see your exit IP; Baidu should feel instant.
- **Coexists with existing Clash clients** — fully independent, random ports.

## Known limitations

| Limitation | Cause | Mitigation |
|---|---|---|
| `hysteria2` / `vless-reality` depend on a bundled Go connector (Windows amd64 binary) | QUIC / uTLS fingerprinting cannot be implemented in pure JS | On other platforms/arches run `go build -o ../lib/native/connector.exe .` from `native/` |
| `tuic` not supported | Another QUIC variant, not implemented | Pick `ss`/`trojan`/`vless`/`vmess`/`hysteria2`/`socks5`/`http` nodes in the GUI |
| Some nodes have unstable egress to google / wikipedia / x.com (observed timeouts) | Depends on the subscription node's exit route | Test each node in the GUI and switch to a more stable one |
| Only affects the Harness process tree; no system proxy | By design (safety boundary) | Use a separate system tool if you need system-wide proxying |
| Pure-JS transports have limited throughput at extreme concurrency | `node:net` / `node:tls` event-loop model | Domestic traffic is direct; use proxied egress on demand |

## Changelog

- **0.2.0** — pure-JS transports for `ss` / `trojan` / `vless`(tcp/tls/ws) / `vmess` / `socks5` / `http`; added `hysteria2` and `vless-reality` (bundled Go native connector); Web GUI (status/subscription update/node list/latency tests/selection/traffic); rule engine + CN routing data + subscription parsing.

## License & compliance

MIT. This plugin provides technical capability only; ensure your proxy service and usage comply with local laws and regulations.
