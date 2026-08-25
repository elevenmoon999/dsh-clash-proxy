import { createHash } from "node:crypto";

const sha = (parts) => createHash("sha256").update(Buffer.concat(parts)).digest();

const pad = (keyBytes, padByte) => {
	const buf = Buffer.alloc(64, padByte);
	for (let i = 0; i < Math.min(keyBytes.length, 64); i++) buf[i] ^= keyBytes[i];
	return buf;
};

const key = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
const base = Buffer.from("VMess AEAD KDF");
const p1 = Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "hex");

const ipad0 = pad(base, 0x36);
const opad0 = pad(base, 0x5c);
const ipad1 = pad(p1, 0x36);
const opad1 = pad(p1, 0x5c);

const D0 = sha([ipad0, ipad1, key]);
const A = sha([opad0, D0]);
const D1 = sha([ipad0, opad1, A]);
const B = sha([opad0, D1]);

console.log("B (2-path):", B.toString("hex"));
console.log("expect go : a26869e3fa23d8450847d585e0593ae9");
console.log("my GoHmac : 58ddef66acbe74a26410b359acde09b9");
