import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { SocketBuffer, iterableSource } from "../lib/core/transports.js";
import { wsHandshake, WsStream } from "../lib/core/ws.js";
import { sealVmessAeadHeader, buildVmessCommand } from "../lib/core/vmess.js";

const uuidBytes = (uuid) => Buffer.from(String(uuid).replace(/-/g, ""), "hex");

const XRAY = join(process.cwd(), ".clash-test", "xray", "xray.exe");
const UUID = "00000000-0000-0000-0000-000000000000";

const dir = join(process.cwd(), ".clash-test", "xray-run");
mkdirSync(dir, { recursive: true });
const config = {
	log: { loglevel: "debug", access: join(dir, "access.log") },
	inbounds: [{
		port: 10086,
		listen: "127.0.0.1",
		protocol: "vmess",
		settings: { clients: [{ id: UUID, alterId: 0 }] },
		streamSettings: { network: "tcp" }
	}],
	outbounds: [{ protocol: "freedom", settings: {} }]
};
writeFileSync(join(dir, "config.json"), JSON.stringify(config));

const xray = spawn(XRAY, ["run", "-c", join(dir, "config.json")], { windowsHide: true });
xray.stdout.on("data", (chunk) => process.stderr.write(`[xray] ${chunk}`));
xray.stderr.on("data", (chunk) => process.stderr.write(`[xray] ${chunk}`));
await new Promise((resolve) => setTimeout(resolve, 2500));

const net = await import("node:net");
const socket = net.connect(10086, "127.0.0.1");
socket.on("error", (error) => console.error("socket error:", error.message));
socket.on("close", () => console.log("socket CLOSED by peer"));
socket.on("connect", () => console.log("socket connected"));
const buffer = new SocketBuffer(socket);

const cmdKey = createHash("md5").update(uuidBytes(UUID)).update("c48619fe-8f02-49e0-b9e9-edf763e17e21").digest();
const reqKey = randomBytes(16);
const reqIV = randomBytes(16);
const responseHeader = randomBytes(1)[0];
const command = buildVmessCommand({ reqKey, reqIV, responseHeader, host: "www.baidu.com", port: 80 });
console.log("command length:", command.length);
const header = sealVmessAeadHeader(cmdKey, command);
console.log("header length:", header.length);
const mode = process.env.VMESS_DEBUG_MODE ?? "real";
if (mode === "garbage") {
	socket.write(Buffer.alloc(20, 0x41));
	console.log("garbage sent (raw tcp)");
} else if (mode === "full") {
	socket.write(Buffer.concat([header, Buffer.from([0x00, 0x00])]));
	console.log("header + end chunk sent (raw tcp)");
} else {
	socket.write(header);
	console.log("header sent (raw tcp)");
}

try {
	const first = await Promise.race([
		buffer.read(32),
		new Promise((resolve) => setTimeout(() => resolve(Buffer.from("TIMEOUT")), 8000))
	]);
	console.log("server reply bytes:", first.toString("hex"));
} catch (error) {
	console.log("read failed:", error.message);
}
socket.destroy();
xray.kill();
process.exit(0);
