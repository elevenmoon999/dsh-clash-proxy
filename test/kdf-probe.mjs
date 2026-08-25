import { readFileSync } from "node:fs";
import { createDecipheriv, createHash } from "node:crypto";
import { join } from "node:path";
import { vmessKdf } from "../lib/core/vmess.js";

/**
 * Oracle test on xray's captured header:
 * 1. authID (single-path KDF) must decrypt + crc-validate.
 * 2. length field (3-path KDF) must AEAD-open to a sane uint16 length.
 */

const UUID = "00000000-0000-0000-0000-000000000000";
const capture = readFileSync(join(process.cwd(), ".clash-test", "xray-diff", "capture.bin"));
const authId = capture.subarray(0, 16);
const lengthSealed = capture.subarray(16, 34);
const nonce = capture.subarray(34, 42);
const cmdKey = createHash("md5").update(Buffer.from(UUID.replace(/-/g, ""), "hex")).update("c48619fe-8f02-49e0-b9e9-edf763e17e21").digest();

const crc32 = (buf) => {
	let c = 0xffffffff;
	for (const b of buf) {
		c ^= b;
		for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
	}
	return (c ^ 0xffffffff) >>> 0;
};

const gcmOpen = (key, n, sealed, aad) => {
	const d = createDecipheriv("aes-128-gcm", key, n);
	if (aad !== undefined && aad.length > 0) d.setAAD(aad);
	d.setAuthTag(sealed.subarray(sealed.length - 16));
	return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
};

// 1. authID
const key1 = vmessKdf(cmdKey, "AES Auth ID Encryption").subarray(0, 16);
const d1 = createDecipheriv("aes-128-ecb", key1, null);
d1.setAutoPadding(false);
const authPlain = Buffer.concat([d1.update(authId), d1.final()]);
const authCrcOk = crc32(authPlain.subarray(0, 12)) === authPlain.readUInt32BE(12);
console.log("1. authID crc:", authCrcOk);

// 2. length field (3-path KDF)
try {
	const lenKey = vmessKdf(cmdKey, "VMess Header AEAD Key_Length", authId.toString("binary"), nonce.toString("binary")).subarray(0, 16);
	const lenNonce = vmessKdf(cmdKey, "VMess Header AEAD Nonce_Length", authId.toString("binary"), nonce.toString("binary")).subarray(0, 12);
	const length = gcmOpen(lenKey, lenNonce, lengthSealed, authId).readUInt16BE(0);
	console.log(`2. length field opens: value=${length} (payload should be ${length + 16} bytes after nonce)`);
	console.log("   ✓ 3-path KDF OK");
	process.exit(authCrcOk ? 0 : 1);
} catch (error) {
	console.log("2. length field FAILED:", error.message);
	console.log("   ✗ 3-path KDF wrong");
	process.exit(1);
}
