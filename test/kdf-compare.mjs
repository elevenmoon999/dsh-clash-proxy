import { createHash } from "node:crypto";
import { vmessKdf } from "../lib/core/vmess.js";

/** Unified hash interface: update / sum / reset. */
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
		this.inner = innerProvider();
		this.outer = innerProvider();
		const keyBuf = Buffer.from(key);
		const k = Buffer.alloc(64);
		keyBuf.copy(k, 0, 0, Math.min(keyBuf.length, 64));
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
		const innerDigest = this.inner.sum();
		this.outer.reset();
		this.outer.update(this.opad);
		this.outer.update(innerDigest);
		return this.outer.sum();
	}
	reset() {
		this.inner.reset();
		this.inner.update(this.ipad);
	}
}

/** Reference xray KDF with hash2-wrapper semantics. */
function refKdf(key, ...paths) {
	let hmacf = new GoHmac(() => new Sha(), Buffer.from("VMess AEAD KDF"));
	for (const p of paths) {
		const prev = hmacf;
		const wrapper = {
			update: (d) => prev.update(d),
			sum: () => prev.sum(),
			reset: () => prev.reset()
		};
		let calls = 0;
		hmacf = new GoHmac(() => {
			calls++;
			return calls === 1 ? wrapper : prev;
		}, Buffer.from(p));
	}
	hmacf.update(key);
	return hmacf.sum();
}

const key = Buffer.from("0123456789abcdef0123456789abcdef", "hex");
const paths = ["VMess Header AEAD Key_Length", Buffer.from("aaaaaabbbbbbcccc", "binary"), Buffer.from("dddddddd", "binary")];

const mine = vmessKdf(key, ...paths);
const ref = refKdf(key, ...paths);
console.log("mine:", mine.toString("hex"));
console.log("ref :", ref.toString("hex"));
console.log(mine.equals(ref) ? "✓ MATCH" : "✗ DIVERGE");
process.exit(mine.equals(ref) ? 0 : 1);
