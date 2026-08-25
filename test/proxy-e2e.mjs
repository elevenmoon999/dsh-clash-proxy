import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { ClashManager } from "../lib/core/manager.js";
import { startSocks5Server, startSsServer } from "./fixtures.mjs";

/**
 * v2 end-to-end: the real rule proxy with real protocol transports.
 * - node-socks: chains to a local socks5 fixture (which reaches the internet
 *   directly, or through TEST_UPSTREAM_PROXY when set);
 * - node-ss:    chains to a local shadowsocks fixture (same upstream);
 * - domestic hosts route DIRECT through the same proxy port.
 * Exercises the manager boot, env injection, HTTP CONNECT + SOCKS5 serving,
 * node selection, latency tests, traffic counters, and clean teardown.
 */

const testHome = join(process.cwd(), ".clash-test", "home-v2");
mkdirSync(testHome, { recursive: true });
process.env.DSH_HOME = testHome;

const socks = await startSocks5Server();
const ss = await startSsServer("test-password");
console.log(`fixtures: socks5=127.0.0.1:${socks.port} ss=127.0.0.1:${ss.port}`);

const subBody = `
proxies:
  - name: node-socks
    type: socks5
    server: 127.0.0.1
    port: ${socks.port}
  - name: node-ss
    type: ss
    server: 127.0.0.1
    port: ${ss.port}
    cipher: aes-256-gcm
    password: test-password
rules:
  - DOMAIN-SUFFIX,cn,DIRECT
`;
const subServer = createServer((req, res) => {
	res.writeHead(200, { "content-type": "text/yaml" });
	res.end(subBody);
});
await new Promise((resolve) => subServer.listen(0, "127.0.0.1", resolve));
const subPort = subServer.address().port;

const section = {
	enabled: true,
	subscriptionUrl: `http://127.0.0.1:${subPort}/sub.yaml`,
	fetchProxyUrl: "",
	autoUpdateHours: 0,
	groupType: "select",
	latencyTestUrl: "http://www.gstatic.com/generate_204",
	latencyTimeoutMs: 5000,
	noProxy: "localhost,127.0.0.1,::1",
	extraRules: [],
	excludeRules: []
};

const beforeProxy = process.env.HTTP_PROXY;
const manager = new ClashManager({ logger: console }, () => section, {
	subscriptionUrlEnv: "CLASH_SUBSCRIPTION_URL",
	dataDirName: "clash-proxy"
});

console.log("starting rule proxy ...");
await manager.start();
const status = manager.status();
console.log("status:", JSON.stringify(status, null, 2));
if (status.state !== "running") {
	console.error("FAIL: not running");
	process.exit(1);
}
console.log("✓ running on 127.0.0.1:" + status.port);
if (process.env.HTTP_PROXY !== `http://127.0.0.1:${status.port}`) {
	console.error("FAIL: env not injected");
	process.exit(1);
}
console.log("✓ env injection");

const curl = (args) => new Promise((resolve) => {
	const child = spawn("curl.exe", ["-s", ...args], { windowsHide: true });
	let stdout = "";
	let stderr = "";
	let spawnError = null;
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});
	child.on("error", (error) => {
		spawnError = error.message;
	});
	child.on("close", (code) => resolve({ status: code, stdout, stderr, spawnError }));
});

// International through the socks5 node (default select → first node).
let r = await curl(["-m", "40", "-o", "NUL", "-w", "%{http_code}", "-x", `http://127.0.0.1:${status.port}`, "https://github.com"]);
console.log("github via HTTP proxy (socks5 node): exit=" + r.status, "code=" + r.stdout, "spawnError=" + r.spawnError);
if (r.spawnError !== null) {
	console.error("FAIL: curl could not start:", r.spawnError);
	process.exit(1);
}
if (r.stdout !== "200") {
	console.error("FAIL: international fetch via socks5 node");
	console.error("stderr:", r.stderr.slice(0, 400));
	process.exit(1);
}
console.log("✓ international via socks5 node (HTTP CONNECT)");

// Domestic through the same port, DIRECT rule.
r = await curl(["-m", "20", "-o", "NUL", "-w", "%{http_code}", "-x", `http://127.0.0.1:${status.port}`, "http://www.qq.com"]);
console.log("qq.com via HTTP proxy (direct rule): exit=" + r.status, "code=" + r.stdout);
if (r.stdout !== "200" && r.stdout !== "301" && r.stdout !== "302" && r.stdout !== "307" && r.stdout !== "308") {
	console.error("FAIL: domestic direct fetch");
	process.exit(1);
}
console.log("✓ domestic direct via same port");

// SOCKS5 serving on the same port.
r = await curl(["-m", "40", "-o", "NUL", "-w", "%{http_code}", "--socks5-hostname", `127.0.0.1:${status.port}`, "https://github.com"]);
console.log("github via SOCKS5 proxy: exit=" + r.status, "code=" + r.stdout);
if (r.stdout !== "200") {
	console.error("FAIL: socks5 inbound");
	process.exit(1);
}
console.log("✓ SOCKS5 inbound");

// Switch to the ss node through the browser API.
const { EventEmitter } = await import("node:events");
const callApi = (path, method = "GET", payload = undefined) => new Promise((resolve, reject) => {
	const req = new EventEmitter();
	req.method = method;
	req.url = `/clash-proxy/${path}`;
	const res = {
		headersSent: false,
		status: 0,
		writeHead(code) {
			this.status = code;
		},
		end(body) {
			resolve({ status: this.status, body: JSON.parse(body) });
		}
	};
	manager.handleHttp(req, res).catch(reject);
	setImmediate(() => {
		if (payload !== undefined) req.emit("data", Buffer.from(JSON.stringify(payload)));
		req.emit("end");
	});
});

const selected = await callApi("select", "POST", { name: "node-ss" });
if (selected.body.ok !== true) {
	console.error("FAIL: select node-ss", JSON.stringify(selected.body));
	process.exit(1);
}
r = await curl(["-m", "40", "-o", "NUL", "-w", "%{http_code}", "-x", `http://127.0.0.1:${status.port}`, "https://github.com"]);
console.log("github via ss node: exit=" + r.status, "code=" + r.stdout);
if (r.stdout !== "200") {
	console.error("FAIL: international fetch via ss node");
	process.exit(1);
}
console.log("✓ international via shadowsocks node");

// API surface: proxies + latency test + traffic.
const proxies = await callApi("proxies");
console.log("api /proxies nodes:", proxies.body.nodes.map((node) => `${node.name}:${node.type}`).join(", "));
if (proxies.body.nodes.length !== 2) {
	console.error("FAIL: node list");
	process.exit(1);
}
const latency = await callApi("delay", "POST", { name: "node-socks" });
console.log("api /delay node-socks:", latency.body.delay, "ms");
if (typeof latency.body.delay !== "number" || latency.body.delay <= 0) {
	console.error("FAIL: latency test");
	process.exit(1);
}
const traffic = await callApi("traffic");
console.log("api /traffic:", JSON.stringify(traffic.body));
if (traffic.body.up <= 0 || traffic.body.down <= 0) {
	console.error("FAIL: traffic counters");
	process.exit(1);
}
console.log("✓ api: proxies / delay / traffic");

await manager.stop();
console.log("state after stop:", manager.status().state);
if (process.env.HTTP_PROXY !== beforeProxy) {
	console.error("FAIL: env not restored");
	process.exit(1);
}
console.log("✓ env restored on stop");

subServer.close();
socks.close();
ss.close();
console.log("\nE2E test passed.");
