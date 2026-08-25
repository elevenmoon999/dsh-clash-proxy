import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { ClashManager } from "./core/manager.js";

/**
 * Host half of the dual-face `dsh-clash-proxy` plugin (v2).
 *
 * Responsibilities:
 * - Register a durable settings section (`clash-proxy`) so the shipped
 *   Plugins settings page renders an editable card and the browser page
 *   shares the same config document.
 * - Register a prefix route on the `webServer` service (`/clash-proxy`)
 *   serving the live JSON API the browser page polls (status, nodes,
 *   traffic, latency tests, subscription updates).
 * - Own the {@link ClashManager} lifecycle: start on activation, reconcile
 *   on settings changes, stop on disposal.
 * @module dsh-clash-proxy
 */

/** Cordis plugin name used by loader diagnostics. */
const name = "clash-proxy";

/** Hard dependencies: the timer service backs the auto-update / latency loops. */
const inject = ["timer"];

/** Stable settings namespace (lowercase kebab-case). */
const SETTINGS_NAMESPACE = settingsNamespace("clash-proxy");

/** Environment variable naming the subscription URL when the section omits it. */
const SUBSCRIPTION_URL_ENV = "CLASH_SUBSCRIPTION_URL";

/** The plugin's full config schema; row config, settings section, and browser page all speak it. */
const Config = z.object({
	/** Master switch. When false no proxy listens and no env is injected. */
	enabled: z.boolean().default(true).description("启用代理"),
	/** Clash subscription URL (also reachable via `$CLASH_SUBSCRIPTION_URL`). */
	subscriptionUrl: z.string().role("secret").default("").description("订阅网址"),
	/** Optional upstream proxy for fetching the subscription itself. */
	fetchProxyUrl: z.string().role("secret").default("").description("抓取订阅用的代理（可选）"),
	/** Hours between subscription auto-updates; 0 disables. */
	autoUpdateHours: z.number().step(1).min(0).default(24).description("自动更新间隔（小时，0 关闭）"),
	/** Outbound group type built over all subscription nodes. */
	groupType: z.union([z.const("url-test"), z.const("select"), z.const("fallback")]).default("url-test").description("自动组类型（url-test=自动最快 / select=手动 / fallback）"),
	/** URL used for node health checks and latency tests. */
	latencyTestUrl: z.string().default("http://www.gstatic.com/generate_204").description("测速网址"),
	/** Per-node latency test timeout. */
	latencyTimeoutMs: z.number().step(100).min(500).max(10000).default(3000).description("测速超时（毫秒）"),
	/** NO_PROXY value for harness subprocesses; loopback is always appended. */
	noProxy: z.string().default("localhost,127.0.0.1,::1").description("追加的 NO_PROXY 列表"),
	/** Extra rule lines, e.g. "DOMAIN-SUFFIX,example.com,DIRECT". */
	extraRules: z.array(z.string()).default([]).description("追加规则（如 DOMAIN-SUFFIX,example.com,DIRECT）"),
	/** Subscription rule lines removed from the composed rule set (substring match). */
	excludeRules: z.array(z.string()).default([]).description("剔除的订阅规则（子串匹配）")
});

/**
 * Serve the live JSON API under `/clash-proxy` on the DSH webserver.
 * The route is removed when the plugin fiber disposes.
 * @param ctx - plugin context.
 * @param manager - the live manager answering each request.
 */
function registerWebApi(ctx, manager) {
	ctx.inject(["webServer"], (wsCtx) => {
		ctx.effect(() => wsCtx.webServer.register({
			kind: "prefix",
			path: "/clash-proxy",
			handler: (req, res) => {
				manager.handleHttp(req, res).catch((error) => {
					ctx.logger.warn("clash-proxy: api request failed: %s", error instanceof Error ? error.message : String(error));
					if (!res.headersSent) {
						res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
					}
					res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
				});
			}
		}), "clash-proxy: web api route");
	});
}

/** @param ctx - plugin context. @param config - the row's raw config entry. */
function apply(ctx, config) {
	// Normalize once: schemastery fills every default.
	const initial = Config(config ?? {});
	let current = () => initial;

	// Durable settings section (also renders in the shipped Plugins page).
	installSettingsSection(ctx, SETTINGS_NAMESPACE, Config, initial, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {
			void manager?.reconcile(current());
		}
	});

	const manager = new ClashManager(ctx, () => current(), {
		subscriptionUrlEnv: SUBSCRIPTION_URL_ENV,
		dataDirName: "clash-proxy"
	});
	registerWebApi(ctx, manager);
	ctx.on("dispose", () => void manager.stop());
	// Start asynchronously so a slow first subscription fetch never blocks
	// profile activation; the page reflects progress through /status.
	void manager.start();
}

export { Config, SETTINGS_NAMESPACE, SUBSCRIPTION_URL_ENV, apply, inject, name };
