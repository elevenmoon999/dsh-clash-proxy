import { spawn } from "node:child_process";
import net from "node:net";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createDecipheriv, createHash } from "node:crypto";
import { vmessKdf } from "../lib/core/vmess.js";

/**
 * Differential test: capture a REAL xray client's vmess header bytes
 * (forwarded to a real xray server), then validate them with OUR
 * implementation — decrypting xray's authID proves our KDF/AES match.
 */

const XRAY = join(process.cwd(), ".clash-test", "xray", "xray.exe");
const UUID = "00000000-0000-0000-0000-000000000000";
const dir = join(process.cwd(), ".clash-test", "xray-diff");
mkdirSync(dir, { recursive: true });

const config = {
	log: { loglevel: "warning" },
	inbounds: [
		{ port: 10086, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "tcp" } },
		{ port: 10087, listen: "127.0.0.1", protocol: "socks", settings: {} }
	],
	outbounds: [{ protocol: "vmess", settings: { vnext: [{ address: "127.0.0.1", port: 10088, users: [{ id: UUID, alterId: 0, security: "auto" }] }] }, streamSettings: { network: "tcp" } }]
};
writeFileSync(join(dir, "config.json"), JSON.stringify(config));

// Byte-capture forwarder: 10088 → 10086.
const captured = [];
const forwarder = net.createServer((client) => {
	const upstream = net.connect(10086, "127.0.0.1");
	client.pipe(upstream);
	upstream.pipe(client);
	client.on("data", (chunk) => captured.push(Buffer.from(chunk)));
	client.on("error", () => {});
	upstream.on("error", () => client.destroy());
});
await new Promise((resolve) => forwarder.listen(10088, "127.0.0.1", resolve));

const xray = spawn(XRAY, ["run", "-c", join(dir, "config.json")], { windowsHide: true });
xray.stderr.on("data", () => {});
await new Promise((resolve) => setTimeout(resolve, 2500));

// Drive traffic through xray client → capture → real server.
console.log("driving request through xray client ...");
const result = await new Promise((resolve) => {
	const curl = spawn("curl.exe", ["-s", "-m", "20", "-o", "NUL", "-w", "%{http_code}", "--socks5-hostname", "127.0.0.1:10087", "http://www.baidu.com"], { windowsHide: true });
	let out = "";
	curl.stdout.on("data", (chunk) => {
		out += chunk;
	});
	curl.on("close", (code) => resolve({ code, out }));
});

const total = Buffer.concat(captured);
writeFileSync(join(dir, "capture.bin"), total);
console.log(`xray client → server: HTTP ${result.out} (captured ${total.length} bytes, saved to capture.bin)`);
if (total.length < 16) {
	console.error("FAIL: no capture");
	process.exit(1);
}

// Validate the captured authID with OUR primitives.
const authId = total.subarray(0, 16);
const cmdKey = createHash("md5")
	.update(Buffer.from(UUID.replace(/-/g, ""), "hex"))
	.update("c48619fe-8f02-49e0-b9e9-edf763e17e21")
	.digest();
const decipher = createDecipheriv("aes-128-ecb", vmessKdf(cmdKey, "AES Auth ID Encryption").subarray(0, 16), null);
decipher.setAutoPadding(false);
const plain = Buffer.concat([decipher.update(authId), decipher.final()]);
const time = plain.readBigUInt64BE(0);
const now = BigInt(Math.floor(Date.now() / 1000));
const crc = plain.readUInt32BE(12);
let check = 0xffffffff;
for (const byte of plain.subarray(0, 12)) {
	check ^= byte;
	for (let i = 0; i < 8; i++) check = (check >>> 1) ^ ((check & 1) ? 0xedb88320 : 0);
}
check = (check ^ 0xffffffff) >>> 0;
console.log("authID decrypt with OUR KDF → time ok:", time - now > -120n && time - now < 120n, "| crc ok:", check === crc);
const decryptedOk = (time - now > -120n && time - now < 120n) && check === crc;

xray.kill();
forwarder.close();
if (decryptedOk) {
	console.log("\nDifferential test PASSED: our KDF/authID matches xray's (request HTTP status irrelevant to crypto check).");
	process.exit(0);
}
console.error("\nDifferential test FAILED.");
process.exit(1);
