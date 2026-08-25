import { createHash } from "node:crypto";

const sha = (parts) => createHash("sha256").update(Buffer.concat(parts)).digest();
const pad = (keyBytes, padByte) => {
	const buf = Buffer.alloc(64, padByte);
	for (let i = 0; i < Math.min(keyBytes.length, 64); i++) buf[i] ^= keyBytes[i];
	return buf;
};

const key = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
const base = Buffer.from("VMess AEAD KDF");
const p1 = Buffer.from("VMess Header AEAD Key_Length");
const p2 = Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "hex");

const ipad0 = pad(base, 0x36), opad0 = pad(base, 0x5c);
const ipad1 = pad(p1, 0x36), opad1 = pad(p1, 0x5c);
const ipad2 = pad(p2, 0x36), opad2 = pad(p2, 0x5c);

const D0 = sha([ipad0, ipad1, ipad2, key]);
const A = sha([opad0, D0]);
const D1 = sha([ipad0, opad1, A]);
const B = sha([opad0, D1]);
const D2 = sha([ipad0, ipad1, opad2, B]);
const C = sha([opad0, D2]);
const E = sha([ipad0, opad1, C]);
const F = sha([opad0, E]);

console.log("D0:", D0.toString("hex").slice(0, 16), "(kdf debug said b673f2354cc9d80f)");
console.log("A :", A.toString("hex").slice(0, 16), "(kdf debug said ba5e9836f1e8d35c)");
console.log("D1:", D1.toString("hex").slice(0, 16), "(kdf debug said 0e84123f4cd7c525)");
console.log("B :", B.toString("hex").slice(0, 16), "(kdf debug said 058f67d71382f378)");
console.log("F :", F.subarray(0, 16).toString("hex"), "(expect a26869e3fa23d845)");
