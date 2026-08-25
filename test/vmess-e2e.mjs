import { spawn } from "node:child_process";
import net from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectThrough } from "../lib/core/transports.js";

/**
 * VMess AEAD + WebSocket end-to-end against a real xray-core server:
 * - xray inbound: vmess / ws path "/" / alterId 0 on 127.0.0.1:10086
 * - round-trip 1: HTTP GET to www.baidu.com through the tunnel
 * - round-trip 2: 256KB echo through the tunnel (multi-chunk AEAD integrity)
 */

const XRAY = process.argv[2] ?? join(process.cwd(), ".clash-test", "xray", "xray.exe");
const UUID = "00000000-0000-0000-0000-000000000000";

const dir = join(process.cwd(), ".clash-test", "xray-run");
mkdirSync(dir, { recursive: true });
const config = {
	log: { loglevel: "info" },
	inbounds: [{
		port: 10086,
		listen: "127.0.0.1",
		protocol: "vmess",
		settings: { clients: [{ id: UUID, alterId: 0 }] },
		streamSettings: { network: "ws", wsSettings: { path: "/" } }
	}],
	outbounds: [{ protocol: "freedom", settings: {} }]
};
writeFileSync(join(dir, "config.json"), JSON.stringify(config));

const xray = spawn(XRAY, ["run", "-c", join(dir, "config.json")], { windowsHide: true });
xray.stderr.on("data", (chunk) => process.stderr.write(`[xray] ${chunk}`));
await new Promise((resolve) => setTimeout(resolve, 2500));

const node = {
	type: "vmess",
	server: "127.0.0.1",
	port: 10086,
	uuid: UUID,
	alterId: 0,
	cipher: "auto",
	network: "ws",
	"ws-opts": { path: "/" }
};

const withTimeout = (label, promise, ms) => Promise.race([
	promise.then((value) => ({ label, ok: true, value })),
	new Promise((resolve) => setTimeout(() => resolve({ label, ok: false, value: `timeout ${ms}ms` }), ms))
]);

// Round-trip 1: HTTP over the vmess tunnel.
{
	const face = await connectThrough(node, "www.baidu.com", 80);
	const request = "GET / HTTP/1.1\r\nHost: www.baidu.com\r\nConnection: close\r\n\r\n";
	face.write(Buffer.from(request));
	let response = "";
	for await (const chunk of face.read) {
		response += chunk.toString("latin1");
		if (response.includes("\r\n\r\n")) break;
	}
	const status = (response.split("\r\n")[0] ?? "").split(" ")[1];
	console.log("http via vmess+ws:", response.split("\r\n")[0] ?? "?");
	face.close();
	if (status !== "200" && status !== "301" && status !== "302") {
		console.error("FAIL: http through vmess tunnel");
		process.exit(1);
	}
	console.log("✓ http round-trip through vmess+ws tunnel");
}

// Round-trip 2: 256KB echo integrity (multi-chunk AEAD both directions).
{
	const echo = net.createServer((client) => client.pipe(client));
	await new Promise((resolve) => echo.listen(0, "127.0.0.1", resolve));
	const echoPort = echo.address().port;

	const face = await connectThrough(node, "127.0.0.1", echoPort);
	const payload = Buffer.alloc(256 * 1024);
	for (let i = 0; i < payload.length; i++) payload[i] = i & 0xff;
	face.write(payload);
	let received = Buffer.alloc(0);
	const reader = face.read[Symbol.asyncIterator]();
	const deadline = Date.now() + 30000;
	while (received.length < payload.length && Date.now() < deadline) {
		const { value, done } = await reader.next();
		if (done || value === undefined) break;
		received = Buffer.concat([received, value]);
	}
	const intact = received.length === payload.length && received.equals(payload);
	face.close();
	echo.close();
	console.log(`echo via vmess+ws: ${received.length}/${payload.length} bytes, ${intact ? "INTACT" : "CORRUPT"}`);
	if (!intact) {
		console.error("FAIL: chunked AEAD integrity");
		process.exit(1);
	}
	console.log("✓ 256KB multi-chunk AEAD integrity");
}

xray.kill();
console.log("\nVMess E2E passed.");
process.exit(0);
