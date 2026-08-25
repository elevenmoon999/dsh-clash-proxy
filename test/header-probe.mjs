import { readFileSync } from "node:fs";
import { createDecipheriv, createHash } from "node:crypto";
import { join } from "node:path";
import { vmessKdf, vmessEncodeAddr, buildVmessCommand } from "../lib/core/vmess.js";

const UUID = "00000000-0000-0000-0000-000000000000";
const capture = readFileSync(join(process.cwd(), ".clash-test", "xray-diff", "capture.bin"));
const authId = capture.subarray(0, 16);
const lengthSealed = capture.subarray(16, 34);
const nonce = capture.subarray(34, 42);
const cmdKey = createHash("md5").update(Buffer.from(UUID.replace(/-/g, ""), "hex")).update("c48619fe-8f02-49e0-b9e9-edf763e17e21").digest();

const gcmOpen = (key, n, sealed, aad) => {
	const d = createDecipheriv("aes-128-gcm", key, n);
	if (aad !== undefined && aad.length > 0) d.setAAD(aad);
	d.setAuthTag(sealed.subarray(sealed.length - 16));
	return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
};

const lenKey = vmessKdf(cmdKey, "VMess Header AEAD Key_Length", authId.toString("binary"), nonce.toString("binary")).subarray(0, 16);
const lenNonce = vmessKdf(cmdKey, "VMess Header AEAD Nonce_Length", authId.toString("binary"), nonce.toString("binary")).subarray(0, 12);
const length = gcmOpen(lenKey, lenNonce, lengthSealed, authId).readUInt16BE(0);
const payloadKey = vmessKdf(cmdKey, "VMess Header AEAD Key", authId.toString("binary"), nonce.toString("binary")).subarray(0, 16);
const payloadNonce = vmessKdf(cmdKey, "VMess Header AEAD Nonce", authId.toString("binary"), nonce.toString("binary")).subarray(0, 12);
const command = gcmOpen(payloadKey, payloadNonce, capture.subarray(42, 42 + length + 16), authId);

// Annotate the command bytes.
let i = 0;
const take = (n) => {
	const v = command.subarray(i, i + n);
	i += n;
	return v;
};
console.log("xray command (length", command.length, "):");
console.log("  version:", take(1).toString("hex"));
console.log("  reqIV  :", take(16).toString("hex"));
console.log("  reqKey :", take(16).toString("hex"));
console.log("  V      :", take(1).toString("hex"));
console.log("  Option :", take(1).toString("hex"), "(0x01=S)");
console.log("  security:", take(1).toString("hex"), "= pad", command[35] >> 4, "sec", command[35] & 0xf);
console.log("  reserved:", take(1).toString("hex"));
console.log("  cmd    :", take(1).toString("hex"));
console.log("  atyp   :", take(1).toString("hex"));
const atyp = command[38];
let host;
if (atyp === 0x01) {
	host = [...take(4)].join(".");
} else if (atyp === 0x02) {
	const len = take(1)[0];
	host = take(len).toString("utf8");
} else {
	host = take(16).toString("hex");
}
console.log("  host   :", host);
console.log("  port   :", take(2).readUInt16BE(0));
console.log("  remaining:", command.subarray(i).toString("hex"));

console.log("\nmy buildVmessCommand for www.baidu.com:80:");
const myCmd = buildVmessCommand({ reqKey: Buffer.alloc(16, 1), reqIV: Buffer.alloc(16, 2), responseHeader: 0xe7, host: "www.baidu.com", port: 80 });
console.log("  hex:", myCmd.toString("hex"));
console.log("  layout: version", myCmd[0], "V@33", myCmd[33].toString(16), "Option@34", myCmd[34].toString(16), "sec@35", myCmd[35].toString(16), "cmd@37", myCmd[37].toString(16), "atyp@38", myCmd[38].toString(16));
