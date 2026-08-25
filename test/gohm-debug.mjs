import { createHash } from "node:crypto";

class Sha {
	constructor() {
		this.h = createHash("sha256");
	}
	update(d) {
		this.h.update(d);
	}
	sum() {
		return this.h.digest();
	}
	reset() {
		this.h = createHash("sha256");
	}
}

class GoHmac {
	constructor(innerProvider, key) {
		this.outer = innerProvider();
		this.inner = innerProvider();
		const kb = Buffer.from(key);
		const k = Buffer.alloc(64);
		kb.copy(k, 0, 0, Math.min(kb.length, 64));
		this.ipad = Buffer.alloc(64, 0x36);
		this.opad = Buffer.alloc(64, 0x5c);
		for (let i = 0; i < 64; i++) {
			this.ipad[i] ^= k[i];
			this.opad[i] ^= k[i];
		}
		this.inner.update(this.ipad);
	}
	update(d) {
		this.inner.update(d);
	}
	sum() {
		const id = this.inner.sum();
		this.outer.reset();
		this.outer.update(this.opad);
		this.outer.update(id);
		return this.outer.sum();
	}
	reset() {
		this.inner.reset();
		this.inner.update(this.ipad);
	}
}

function kdf(key, ...paths) {
	let h = new GoHmac(() => new Sha(), Buffer.from("VMess AEAD KDF"));
	for (const p of paths) {
		const prev = h;
		const w = { update: (d) => prev.update(d), sum: () => prev.sum(), reset: () => prev.reset() };
		let c = 0;
		h = new GoHmac(() => {
			c++;
			return c === 1 ? w : prev;
		}, Buffer.from(p));
	}
	h.update(key);
	return h.sum();
}

const key = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
const p1 = Buffer.from("VMess Header AEAD Key_Length");
const p2 = Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "hex");

// Print 1-path and 2-path
console.log("1-path[:16]:", kdf(key, p1.toString("binary")).subarray(0, 16).toString("hex"));
console.log("2-path[:16]:", kdf(key, p1.toString("binary"), p2.toString("binary")).subarray(0, 16).toString("hex"));
console.log("expect 1-path: (compute)   expect 2-path: a26869e3fa23d8450847d585e0593ae9");
