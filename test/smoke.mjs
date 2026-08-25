import { strict as assert } from "node:assert";
import { parseSubscription } from "../lib/core/subscription.js";
import { RuleEngine, ipv4ToInt, inCnCidr4 } from "../lib/core/rules.js";
import { encodeAddr, ssSubkey, ssSeal, ssOpen, makeSsNonce } from "../lib/core/transports.js";
import { composeNoProxy } from "../lib/core/inject.js";

// ---- subscription parsing -------------------------------------------------
const sample = `
proxies:
  - name: "HK-01"
    type: vmess
    server: hk1.example.com
    port: 443
    uuid: fake-uuid
  - name: "JP-02"
    type: trojan
    server: jp2.example.com
    port: 443
    password: fake-pass
  - name: "DIRECT"
    type: direct
proxy-groups:
  - name: "PROXY"
    type: select
    proxies: ["HK-01", "JP-02", "DIRECT"]
rules:
  - DOMAIN-SUFFIX,cn,DIRECT
  - DOMAIN-SUFFIX,google.com,PROXY
  - MATCH,PROXY
`;
const parsed = parseSubscription(sample);
assert.deepStrictEqual(parsed.names, ["HK-01", "JP-02"], "DIRECT filtered");
assert.strictEqual(parsed.groups.length, 1);
const encoded = Buffer.from(sample, "utf8").toString("base64");
assert.deepStrictEqual(parseSubscription(encoded).names, ["HK-01", "JP-02"], "base64 decodes");
console.log("✓ parseSubscription");

// ---- rule engine ----------------------------------------------------------
const engine = new RuleEngine({
	extraRules: ["DOMAIN-SUFFIX,deepseek.com,DIRECT", "DOMAIN-KEYWORD,google,PROXY", "IP-CIDR,10.0.0.0/8,DIRECT"],
	subscriptionRules: ["DOMAIN-SUFFIX,cn,DIRECT"]
});
assert.strictEqual(engine.decide("www.baidu.com"), "direct", "embedded CN suffix");
assert.strictEqual(engine.decide("baidu.com"), "direct");
assert.strictEqual(engine.decide("api.deepseek.com"), "direct", "extra rule");
assert.strictEqual(engine.decide("www.google.com"), "proxy", "foreign default");
assert.strictEqual(engine.decide("www.google.com.hk"), "proxy", "keyword rule hits (same result)");
assert.strictEqual(engine.decide("x.google.cn"), "proxy", "user keyword rule wins over CN suffix (rule order)");
assert.strictEqual(engine.decide("www.example.cn"), "direct", "cn TLD direct");
assert.strictEqual(engine.decide("10.1.2.3"), "direct", "custom IP-CIDR");
assert.strictEqual(engine.decide("1.1.1.1"), "proxy", "foreign IP default");
assert.strictEqual(engine.decide("220.181.38.148"), "direct", "embedded CN CIDR (baidu range)");
console.log("✓ RuleEngine domain/IP splitting");

// CIDR helpers
assert.strictEqual(ipv4ToInt("255.255.255.255"), 0xffffffff);
assert.strictEqual(ipv4ToInt("1.2.3.999"), null);
assert.strictEqual(inCnCidr4(ipv4ToInt("220.181.38.148")), true);
assert.strictEqual(inCnCidr4(ipv4ToInt("8.8.8.8")), false);
console.log("✓ CIDR helpers");

// reject action
const rejecting = new RuleEngine({ extraRules: ["DOMAIN-SUFFIX,ads.example,REJECT"] });
assert.strictEqual(rejecting.decide("ads.example"), "reject");
console.log("✓ REJECT action");

// ---- address encoding -----------------------------------------------------
assert.deepStrictEqual(encodeAddr("1.2.3.4", 443), Buffer.from([0x01, 1, 2, 3, 4, 0x01, 0xbb]));
const hostname = encodeAddr("example.com", 8080);
assert.strictEqual(hostname[0], 0x03);
assert.strictEqual(hostname[1], 11);
assert.strictEqual(hostname.readUInt16BE(hostname.length - 2), 8080);
console.log("✓ encodeAddr");

// ---- shadowsocks framing roundtrip ---------------------------------------
const cipher = "aes-256-gcm";
const salt = Buffer.alloc(32, 7);
const key = ssSubkey("secret-password", salt, cipher);
const outNonce = makeSsNonce();
const inNonce = makeSsNonce();
const payload = Buffer.from("hello-shadowsocks");
const sealed = ssSeal(cipher, key, outNonce.next(), payload);
assert.strictEqual(sealed.length, payload.length + 16);
assert.deepStrictEqual(ssOpen(cipher, key, inNonce.next(), sealed), payload);
const chunked = ssSeal(cipher, key, outNonce.next(), Buffer.alloc(100, 1));
assert.deepStrictEqual(ssOpen(cipher, key, inNonce.next(), chunked), Buffer.alloc(100, 1));
console.log("✓ shadowsocks AEAD roundtrip");

// ---- NO_PROXY composition --------------------------------------------------
const noProxy = composeNoProxy("localhost,127.0.0.1,::1,.cn");
assert.match(noProxy, /127\.0\.0\.1/);
assert.match(noProxy, /<local>/);
assert.match(noProxy, /\.cn/);
console.log("✓ composeNoProxy");

console.log("\nAll smoke tests passed.");
