import { spawn } from "node:child_process";
import net from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectThrough } from "../lib/core/transports.js";

const XRAY = join(process.cwd(), ".clash-test", "xray", "xray.exe");
const PASSWORD = "00000000-0000-0000-0000-000000000000";
const dir = join(process.cwd(), ".clash-test", "xray-run");
mkdirSync(dir, { recursive: true });

const config = {
	log: { loglevel: "warning" },
	inbounds: [{
		port: 10087, listen: "127.0.0.1", protocol: "trojan",
		settings: { clients: [{ password: PASSWORD }] },
		streamSettings: {
			network: "ws", security: "tls",
			wsSettings: { path: "/images" },
			tlsSettings: { certificates: [{ certificateFile: join(dir, "cert.pem"), keyFile: join(dir, "key.pem") }] }
		}
	}],
	outbounds: [{ protocol: "freedom", settings: {} }]
};
writeFileSync(join(dir, "config.json"), JSON.stringify(config));

let xray = null;
let echo = null;
let settled = false;

const guard = setTimeout(() => { if (!settled) { settled = true; console.error("GUARD timeout"); finish(2); } }, 15000);

function finish(code) {
	if (settled && code !== 2) return;
	settled = true;
	clearTimeout(guard);
	try { xray?.kill(); } catch {}
	try { echo?.close(); } catch {}
	setTimeout(() => process.exit(code), 300);
}

try {
	xray = spawn(XRAY, ["run", "-c", join(dir, "config.json")], { windowsHide: true });
	await new Promise((resolve) => setTimeout(resolve, 2500));

	echo = net.createServer((client) => client.pipe(client));
	await new Promise((resolve) => echo.listen(0, "127.0.0.1", resolve));
	const echoPort = echo.address().port;

	const node = {
		type: "trojan", server: "127.0.0.1", port: 10087, password: PASSWORD,
		network: "ws", "skip-cert-verify": true, "ws-opts": { path: "/images" }
	};

	const face = await connectThrough(node, "127.0.0.1", echoPort);
	console.log("trojan+ws tunnel established");
	const payload = Buffer.from("hello-trojan-ws");
	face.write(payload);
	let received = Buffer.alloc(0);
	for await (const chunk of face.read) {
		received = Buffer.concat([received, chunk]);
		if (received.length >= payload.length) break;
	}
	console.log("echo:", received.toString(), received.equals(payload) ? "✓ MATCH" : "✗ MISMATCH");
	face.close();
	finish(received.equals(payload) ? 0 : 1);
} catch (error) {
	console.error("FAIL:", error?.message ?? error);
	finish(1);
}
