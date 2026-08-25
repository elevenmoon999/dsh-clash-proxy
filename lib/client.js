window.__ModuleLoader__.load({
	id: "dsh-clash-proxy",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const react = require("react");
		const { useState, useEffect, useCallback, useRef, useSyncExternalStore } = react;

		/** Dictionary namespace owned by this plugin. */
		const NS = "clash-proxy";

		const zh = {
			nav: "Clash 代理",
			title: "Harness 内置代理",
			description: "智能分流代理，仅作用于 DeepSeek Harness 进程环境：国内流量直连，国外流量走订阅节点（hysteria2/vless-reality 经内置原生连接器）。",
			state: "状态",
			running: "运行中",
			starting: "启动中",
			stopped: "已停止",
			failed: "失败",
			disabled: "已禁用",
			noSubscription: "缺少订阅",
			enabled: "启用代理",
			disable: "禁用",
			enable: "启用",
			restart: "重启代理",
			updateSubscription: "更新订阅",
			subscription: "订阅",
			subscriptionUrlLabel: "订阅网址",
			saveAndUpdate: "保存并更新",
			urlHint: "把机场提供的订阅链接粘贴到上面，点击“保存并更新”。也可以设置环境变量 CLASH_SUBSCRIPTION_URL；若订阅网址本身无法访问，请配置 fetchProxyUrl。",
			lastUpdate: "上次更新",
			never: "从未",
			nodes: "个节点",
			noUrl: "未配置订阅网址",
			configureHint: "请在设置中填写 subscriptionUrl（或设置环境变量 CLASH_SUBSCRIPTION_URL），然后点击“更新订阅”。",
			traffic: "流量",
			upload: "上传",
			download: "下载",
			groups: "代理组",
			nodeList: "节点列表",
			latency: "延迟",
			test: "测速",
			testing: "测速中…",
			testAll: "全部测速",
			testingAll: "测速中",
			select: "选择",
			current: "当前",
			type: "类型",
			error: "错误",
			refreshFailed: "状态刷新失败",
			scoped: "仅作用于 harness 环境（不修改系统代理）",
			bytes: "字节"
		};
		const en = {
			nav: "Clash Proxy",
			title: "Harness Proxy",
			description: "A self-contained rule-splitting proxy confined to the DeepSeek Harness process tree: domestic traffic goes direct, international traffic routes through subscription nodes (hysteria2/vless-reality via a bundled native connector).",
			state: "State",
			running: "Running",
			starting: "Starting",
			stopped: "Stopped",
			failed: "Failed",
			disabled: "Disabled",
			noSubscription: "No subscription",
			enabled: "Proxy enabled",
			disable: "Disable",
			enable: "Enable",
			restart: "Restart proxy",
			updateSubscription: "Update subscription",
			subscription: "Subscription",
			subscriptionUrlLabel: "Subscription URL",
			saveAndUpdate: "Save & update",
			urlHint: "Paste the subscription link from your provider above, then click \"Save & update\". The CLASH_SUBSCRIPTION_URL environment variable also works; if the URL itself is unreachable, configure fetchProxyUrl.",
			lastUpdate: "Last update",
			never: "never",
			nodes: "nodes",
			noUrl: "No subscription URL configured",
			configureHint: "Fill in subscriptionUrl in the settings (or set the CLASH_SUBSCRIPTION_URL environment variable), then click \"Update subscription\".",
			traffic: "Traffic",
			upload: "Upload",
			download: "Download",
			groups: "Proxy groups",
			nodeList: "Nodes",
			latency: "Latency",
			test: "Test",
			testing: "Testing…",
			testAll: "Test all",
			testingAll: "Testing",
			select: "Select",
			current: "current",
			type: "Type",
			error: "Error",
			refreshFailed: "Status refresh failed",
			scoped: "Scoped to the harness environment only (system proxy untouched)",
			bytes: "bytes"
		};

		const inject = ["slots", "locale", "settingsScope"];

		/** Compact shared styles (theme-agnostic). */
		const css = {
			root: { display: "flex", flexDirection: "column", gap: 12, padding: "12px 0", fontSize: 15, lineHeight: 1.6, fontFamily: "'SimHei', '黑体', 'Microsoft YaHei', 'PingFang SC', 'Segoe UI', sans-serif" },
			row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
			card: { border: "1px solid rgba(128,128,128,.35)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 },
			title: { fontSize: 17, fontWeight: 600, margin: 0 },
			muted: { opacity: .65, fontSize: 13 },
			button: {
				border: "1px solid rgba(128,128,128,.5)", background: "transparent", borderRadius: 6,
				padding: "5px 12px", cursor: "pointer", fontSize: 13
			},
			buttonPrimary: {
				border: "1px solid rgba(80,140,255,.7)", background: "rgba(80,140,255,.12)", borderRadius: 6,
				padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600
			},
			input: {
				flex: 1, minWidth: 200, padding: "6px 10px", borderRadius: 6, fontSize: 13,
				border: "1px solid rgba(128,128,128,.5)", background: "transparent",
				color: "inherit", outline: "none"
			},
			badge: { padding: "3px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600 },
			mono: { fontFamily: "'SimHei', '黑体', 'Microsoft YaHei', 'PingFang SC', 'Segoe UI', sans-serif, 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', 'Twemoji Mozilla', 'EmojiOne Color'" },
			list: { display: "flex", flexDirection: "column", gap: 4 },
			item: { display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", padding: "4px 0" },
			error: { border: "1px solid rgba(220,80,80,.5)", background: "rgba(220,80,80,.1)", borderRadius: 6, padding: "8px 12px", fontSize: 13 }
		};

		const BADGE_COLORS = {
			running: { background: "rgba(60,180,90,.18)", color: "#3cb45a" },
			starting: { background: "rgba(230,160,60,.18)", color: "#e6a03c" },
			stopped: { background: "rgba(128,128,128,.2)", color: "#999" },
			disabled: { background: "rgba(128,128,128,.2)", color: "#999" },
			"no-subscription": { background: "rgba(230,160,60,.18)", color: "#e6a03c" },
			failed: { background: "rgba(220,80,80,.18)", color: "#dc5050" }
		};

		function formatBytes(value) {
			if (value === null || value === undefined) return "0 B";
			const units = ["B", "KB", "MB", "GB", "TB"];
			let n = Number(value);
			let i = 0;
			while (n >= 1024 && i < units.length - 1) {
				n /= 1024;
				i += 1;
			}
			return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
		}

		function formatRate(value) {
			return `${formatBytes(value)}/s`;
		}

		function formatTime(timestamp) {
			if (timestamp === null || timestamp === undefined) return null;
			return new Date(timestamp).toLocaleString();
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "clash-proxy: dictionaries");
			const t = ctx.locale.bind(NS);
			const scope = ctx.settingsScope.bind({ namespace: NS });
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "clash-proxy",
				order: 20,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({ scope, t })
			}, function ClashSectionBound(props) {
				return react.createElement(ErrorBoundary, { label: "clash-proxy" },
					react.createElement(ClashSection, props)
				);
			}));
		}

		/** Class component catching render errors so the section never blanks out silently. */
		class ErrorBoundary extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			render() {
				if (this.state.error !== null) {
					const message = this.state.error instanceof Error ? this.state.error.message : String(this.state.error);
					return react.createElement("div", { style: css.error },
						`[${this.props.label}] render error: ${message}`
					);
				}
				return this.props.children;
			}
		}

		function ClashSection({ scope, t }) {
			// Method references must be bound: useSyncExternalStore calls them
			// without a receiver, and unbound class methods crash the render.
			const subscribe = useCallback((listener) => scope.subscribe(listener), [scope]);
			const getSnapshot = useCallback(() => scope.getSnapshot(), [scope]);
			const settingsSnapshot = useSyncExternalStore(subscribe, getSnapshot);
			const section = settingsSnapshot.value ?? {};
			const [status, setStatus] = useState(null);
			const [proxies, setProxies] = useState({ groups: [], nodes: [] });
			const [traffic, setTraffic] = useState({ up: 0, down: 0, upRate: 0, downRate: 0 });
			const [testing, setTesting] = useState(null);
			const [testingAll, setTestingAll] = useState(null); // { done, total } or null
			const [actionBusy, setActionBusy] = useState(false);
			const [actionError, setActionError] = useState(null);
			const apiBase = "/clash-proxy/";

			const api = useCallback(async (path, options) => {
				const response = await fetch(apiBase + path, {
					...options,
					headers: options?.body !== undefined ? { "content-type": "application/json" } : undefined
				});
				const text = await response.text();
				const payload = text.length > 0 ? JSON.parse(text) : {};
				if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
				return payload;
			}, [apiBase]);

			useEffect(() => {
				let cancelled = false;
				let cleared = false;
				const tick = async () => {
					try {
						// Latencies are ephemeral: clear them once per page load so a
						// refresh starts from an empty delay column.
						if (!cleared) {
							cleared = true;
							await api("clear-latencies", { method: "POST" }).catch(() => {});
						}
						const [nextStatus, nextTraffic] = await Promise.all([
							api("status"),
							api("traffic").catch(() => null)
						]);
						if (cancelled) return;
						setStatus(nextStatus);
						if (nextTraffic !== null) setTraffic(nextTraffic);
						setActionError(null);
						if (nextStatus.state === "running") {
							const nextProxies = await api("proxies").catch(() => null);
							if (!cancelled && nextProxies !== null) setProxies(nextProxies);
						}
					} catch (error) {
						if (!cancelled) setActionError(error instanceof Error ? error.message : String(error));
					}
				};
				void tick();
				const handle = setInterval(() => void tick(), 2500);
				return () => {
					cancelled = true;
					clearInterval(handle);
				};
			}, [api]);

			const runAction = useCallback(async (action) => {
				setActionBusy(true);
				setActionError(null);
				try {
					await action();
				} catch (error) {
					setActionError(error instanceof Error ? error.message : String(error));
				} finally {
					setActionBusy(false);
				}
			}, []);

			const testNode = useCallback((name) => {
				setTesting(name);
				void api("delay", { method: "POST", body: JSON.stringify({ name }) })
					.then((result) => setProxies((prev) => ({
						...prev,
						nodes: prev.nodes.map((node) => node.name === name
							? { ...node, delay: result.delay ?? null, alive: result.delay !== null && result.delay !== undefined }
							: node)
					})))
					.catch((error) => setActionError(error instanceof Error ? error.message : String(error)))
					.finally(() => setTesting(null));
			}, [api]);

			const testAllNodes = useCallback((names) => {
				if (names.length === 0) return;
				const queue = [...names];
				let done = 0;
				let firstError = null;
				const CONCURRENCY = 8;
				setTestingAll({ done: 0, total: names.length });
				const worker = async () => {
					while (queue.length > 0) {
						const name = queue.shift();
						try {
							const result = await api("delay", { method: "POST", body: JSON.stringify({ name }) });
							setProxies((prev) => ({
								...prev,
								nodes: prev.nodes.map((node) => node.name === name
									? { ...node, delay: result.delay ?? null, alive: result.delay !== null && result.delay !== undefined }
									: node)
							}));
						} catch (error) {
							if (firstError === null) firstError = error;
						} finally {
							done += 1;
							setTestingAll({ done, total: names.length });
						}
					}
				};
				void Promise.all(Array.from({ length: Math.min(CONCURRENCY, names.length) }, worker))
					.then(() => {
						if (firstError !== null) setActionError(firstError instanceof Error ? firstError.message : String(firstError));
					})
					.finally(() => setTestingAll(null));
			}, [api]);

			const selectNode = useCallback((name) => {
				void api("select", { method: "POST", body: JSON.stringify({ name }) })
					.then(() => api("status").then(setStatus))
					.catch((error) => setActionError(error instanceof Error ? error.message : String(error)));
			}, [api]);

			const state = status?.state ?? "stopped";
			const stateKey = state === "no-subscription" ? "noSubscription" : state;
			const badgeStyle = { ...css.badge, ...(BADGE_COLORS[state] ?? BADGE_COLORS.stopped) };
			const lastUpdate = formatTime(status?.lastSubscriptionUpdate);

			// Subscription URL input: drafts locally, then saves + refreshes.
			const [urlDraft, setUrlDraft] = useState(null);
			useEffect(() => {
				setUrlDraft((prev) => prev ?? (section.subscriptionUrl ?? ""));
			}, [section.subscriptionUrl]);
			const urlValue = urlDraft ?? section.subscriptionUrl ?? "";
			const saveUrl = () => {
				const value = urlValue.trim();
				if (value.length === 0) return;
				runAction(async () => {
					await scope.set("subscriptionUrl", value);
					await api("update-subscription", { method: "POST" });
				});
			};

			const toggle = () => {
				void scope.set("enabled", section.enabled === false);
			};

			return react.createElement("div", { style: css.root },
				react.createElement("div", { style: css.card },
					react.createElement("div", { style: css.row },
						react.createElement("h3", { style: css.title }, t("title")),
						react.createElement("span", { style: badgeStyle }, t(stateKey))
					),
					react.createElement("div", { style: css.muted }, t("description")),
					react.createElement("div", { style: css.muted }, t("scoped")),
					status?.error !== null && status?.error !== undefined
						? react.createElement("div", { style: css.error }, `${t("error")}: ${status.error}`)
						: null,
					react.createElement("div", { style: css.row },
						react.createElement("button", { style: css.buttonPrimary, disabled: actionBusy, onClick: toggle }, section.enabled === false ? t("enable") : t("disable")),
						react.createElement("button", { style: css.button, disabled: actionBusy, onClick: () => runAction(() => api("restart", { method: "POST" })) }, t("restart")),
						react.createElement("button", { style: css.button, disabled: actionBusy, onClick: () => runAction(() => api("update-subscription", { method: "POST" })) }, t("updateSubscription"))
					),
					actionError !== null ? react.createElement("div", { style: css.error }, `${t("error")}: ${actionError}`) : null
				),
				react.createElement("div", { style: css.card },
					react.createElement("div", { style: css.row },
						react.createElement("span", { style: { fontWeight: 600, whiteSpace: "nowrap" } }, t("subscriptionUrlLabel")),
						react.createElement("input", {
							style: css.input,
							value: urlValue,
							placeholder: "https://...",
							spellCheck: false,
							onChange: (event) => setUrlDraft(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") saveUrl();
							}
						}),
						react.createElement("button", {
							style: css.buttonPrimary,
							disabled: actionBusy || urlValue.trim().length === 0,
							onClick: saveUrl
						}, t("saveAndUpdate"))
					),
					react.createElement("div", { style: css.muted }, t("urlHint")),
					react.createElement("div", { style: css.row },
						react.createElement("span", { style: css.muted }, t("lastUpdate")),
						react.createElement("span", null, lastUpdate ?? t("never")),
						status?.nodeCount > 0 ? react.createElement("span", { style: css.muted }, `${status.nodeCount} ${t("nodes")}`) : null
					)
				),
				state === "running" ? react.createElement("div", { style: css.card },
					react.createElement("div", { style: css.row },
						react.createElement("span", { style: { fontWeight: 600 } }, t("traffic")),
						react.createElement("span", { style: css.mono }, `↓ ${formatRate(traffic.downRate)}`),
						react.createElement("span", { style: css.mono }, `↑ ${formatRate(traffic.upRate)}`),
						react.createElement("span", { style: css.muted }, `${t("download")} ${formatBytes(traffic.down)} · ${t("upload")} ${formatBytes(traffic.up)}`)
					)
				) : null,
				state === "running" && proxies.groups.length > 0 ? react.createElement("div", { style: css.card },
					react.createElement("div", { style: { fontWeight: 600 } }, t("groups")),
					react.createElement("div", { style: css.list }, proxies.groups.map((group) => react.createElement("div", { key: group.name, style: css.item },
						react.createElement("span", { style: css.mono }, `${group.name} `),
						react.createElement("span", { style: css.muted }, group.type),
						react.createElement("span", { style: css.muted }, `${t("current")}: ${group.now ?? "—"}`),
						react.createElement("span", { style: { flex: 1 } }),
						react.createElement("span", { style: css.muted }, `${group.all?.length ?? 0} ${t("nodes")}`)
					)))
				) : null,
				state === "running" ? react.createElement("div", { style: css.card },
					react.createElement("div", { style: css.row },
						react.createElement("span", { style: { fontWeight: 600 } }, t("nodeList")),
						react.createElement("span", { style: { flex: 1 } }),
						react.createElement("button", {
							style: css.buttonPrimary,
							disabled: testingAll !== null || testing !== null,
							onClick: () => testAllNodes(proxies.nodes.map((node) => node.name))
						}, testingAll !== null ? `${t("testingAll")} ${testingAll.done}/${testingAll.total}` : t("testAll"))
					),
					react.createElement("div", { style: css.list }, [...proxies.nodes].sort((a, b) => {
						const da = a.delay === null || a.delay === undefined ? Infinity : a.delay;
						const db = b.delay === null || b.delay === undefined ? Infinity : b.delay;
						return da - db;
					}).map((node) => {
						const isSelected = status?.selected === node.name;
						return react.createElement("div", { key: node.name, style: css.item },
							react.createElement("span", {
								style: { ...css.mono, color: isSelected ? "#66CCFF" : undefined, fontWeight: isSelected ? 600 : undefined },
								title: node.name
							}, node.name.length > 34 ? `${node.name.slice(0, 34)}…` : node.name),
							react.createElement("span", { style: css.muted }, node.type ?? ""),
							react.createElement("span", { style: { flex: 1 } }),
							react.createElement("span", {
								style: {
									...css.mono,
									color: node.delay === null || node.delay === undefined
										? undefined
										: node.delay < 200 ? "#3cb45a" : node.delay < 500 ? "#e6a03c" : "#dc5050",
									fontWeight: node.delay !== null && node.delay !== undefined ? 600 : undefined
								}
							}, node.delay === null || node.delay === undefined ? "—" : `${node.delay} ms`),
							react.createElement("button", {
								style: css.button,
								disabled: testing !== null || testingAll !== null,
								onClick: () => testNode(node.name)
							}, testing === node.name ? t("testing") : t("test")),
							react.createElement("button", {
								style: isSelected ? css.buttonPrimary : css.button,
								disabled: isSelected,
								onClick: () => selectNode(node.name)
							}, isSelected ? t("current") : t("select"))
						);
					}))
				) : null,
				state === "no-subscription" ? react.createElement("div", { style: css.card },
					react.createElement("div", { style: css.muted }, t("configureHint"))
				) : null
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
