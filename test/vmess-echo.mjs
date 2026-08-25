import { spawn } from "node:child_process";
import net from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectThrough } from "../lib/core/transports.js";

const XRAY = join(process.cwd(), ".clash-test", "xray", "xray.exe");
const UUID = "00000000-0000-0000-0000-000000000000";
const dir = join(process.cwd(), ".clash-test", "xray-run");
mkdirSync(dir, { recursive: true });

const config = {
	log: { loglevel: "warning" },
	inbounds: [{
		port: 10086, listen: "127.0.0.1", protocol: "vmess",
		settings: { clients: [{ id: UUID, alterId: 0 }] },
		streamSettings: { network: "tcp" }
	}],
	outbounds: [{ protocol: "freedom", settings: {} }]
};
writeFileSync(join(dir, "config.json"), JSON.stringify(config));

let xray = null;
let echo = null;
let settled = false;

// Hard guard: never hang, always clean up and exit.
const guard = setTimeout(() => {
	if (settled) return;
	settled = true;
	console.error("GUARD: timed out, cleaning up");
	finish(2);
}, 15000);

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

	// Local echo target (freedom outbound dials localhost instantly).
	echo = net.createServer((client) => client.pipe(client));
	await new Promise((resolve) => echo.listen(0, "127.0.0.1", resolve));
	const echoPort = echo.address().port;

	const node = { type: "vmess", server: "127.0.0.1", port: 10086, uuid: UUID, alterId: 0, cipher: "auto", network: "tcp" };

	const face = await connectThrough(node, "127.0.0.1", echoPort);
	console.log("vmess tunnel established");
	const payload = Buffer.from("hello-vmess-echo");
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
