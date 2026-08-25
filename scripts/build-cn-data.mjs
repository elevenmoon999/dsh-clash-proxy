import { writeFile, mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Regenerate the embedded CN routing data from upstream lists.
 * Outputs (committed to the package):
 * - lib/core/data/cn-domains.json — compact suffix array for *.cn-style
 *   matching (DOMAIN-SUFFIX semantics)
 * - lib/core/data/cn-cidrs.json   — packed IPv4 CIDRs [[ipInt, prefix]...]
 * - lib/core/data/cn-cidrs6.json  — IPv6 CIDR strings
 * @module dsh-clash-proxy/build-cn-data
 */

const SOURCES = {
	cidr: [
		"https://raw.githubusercontent.com/17mon/china_ip_list/master/china_ip_list.txt",
		"https://cdn.jsdelivr.net/gh/17mon/china_ip_list@master/china_ip_list.txt"
	],
	cidr6: [
		"https://raw.githubusercontent.com/gaoyifan/china-operator-ip/ip-lists/china6.txt",
		"https://cdn.jsdelivr.net/gh/gaoyifan/china-operator-ip@ip-lists/china6.txt"
	],
	domains: [
		"https://raw.githubusercontent.com/felixonmars/dnsmasq-china-list/master/accelerated-domains.china.conf",
		"https://cdn.jsdelivr.net/gh/felixonmars/dnsmasq-china-list@master/accelerated-domains.china.conf"
	]
};

/** Chinese multi-label TLDs: keep three labels so *.com.cn style matches. */
const MULTI_LABEL_CN = new Set(["com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "ac.cn", "mil.cn", "sh.cn", "bj.cn", "tj.cn", "cq.cn", "he.cn", "sx.cn", "nm.cn", "ln.cn", "jl.cn", "hl.cn", "js.cn", "zj.cn", "ah.cn", "fj.cn", "jx.cn", "sd.cn", "ha.cn", "hb.cn", "hn.cn", "gd.cn", "gx.cn", "hi.cn", "sc.cn", "gz.cn", "yn.cn", "xz.cn", "sn.cn", "gs.cn", "qh.cn", "nx.cn", "xj.cn", "tw.cn", "hk.cn", "mo.cn"]);

async function fetchText(urls) {
	let lastError;
	for (const url of urls) {
		try {
			const response = await fetch(url, { redirect: "follow" });
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return await response.text();
		} catch (error) {
			lastError = error;
		}
	}
	throw new Error(`all sources failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

/** Extract compact suffixes from the dnsmasq list. */
function extractSuffixes(text) {
	const suffixes = new Set();
	for (const line of text.split("\n")) {
		const match = /^server=\/([^/]+)\//.exec(line);
		if (match === null) continue;
		const domain = match[1].replace(/^\.+|\.+$/g, "").toLowerCase();
		if (domain.length === 0) continue;
		const labels = domain.split(".");
		if (labels.length < 2) continue;
		const tld2 = labels.slice(-2).join(".");
		const keep = MULTI_LABEL_CN.has(tld2) && labels.length >= 3 ? labels.slice(-3).join(".") : tld2;
		suffixes.add(keep);
	}
	// Drop longer entries already covered by a shorter suffix.
	const sorted = [...suffixes].sort((a, b) => a.length - b.length);
	const kept = [];
	for (const suffix of sorted) {
		const covered = kept.some((existing) => suffix.endsWith(`.${existing}`) || suffix === existing);
		if (!covered) kept.push(suffix);
	}
	return kept.sort();
}

/** Pack IPv4 CIDRs into [ipInt, prefixLen] pairs. */
function packCidrs(text) {
	const rows = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		const slash = trimmed.indexOf("/");
		if (slash < 0) continue;
		const ip = trimmed.slice(0, slash);
		const prefix = Number(trimmed.slice(slash + 1));
		if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || !Number.isInteger(prefix)) continue;
		const parts = ip.split(".").map(Number);
		if (parts.some((part) => part > 255)) continue;
		const ipInt = ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
		rows.push([ipInt, prefix]);
	}
	rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	return rows;
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "lib", "core", "data");
await mkdir(outDir, { recursive: true });

const writeGz = async (name, payload) => {
	const raw = Buffer.from(JSON.stringify(payload));
	await writeFile(join(outDir, name), gzipSync(raw, { level: 9 }));
	console.log(`${name}: ${(raw.length / 1024).toFixed(0)} KB -> ${(gzipSync(raw, { level: 9 }).length / 1024).toFixed(0)} KB gz`);
};

const cidrText = await fetchText(SOURCES.cidr);
const cidrs = packCidrs(cidrText);
await writeGz("cn-cidrs.json.gz", cidrs);
console.log(`  ${cidrs.length} IPv4 CIDRs`);

const cidr6Text = await fetchText(SOURCES.cidr6);
const cidrs6 = cidr6Text.split("\n").map((line) => line.trim()).filter((line) => line.includes("/") && line.includes(":")).sort();
await writeGz("cn-cidrs6.json.gz", cidrs6);
console.log(`  ${cidrs6.length} IPv6 CIDRs`);

const domainsText = await fetchText(SOURCES.domains);
const suffixes = extractSuffixes(domainsText);
await writeGz("cn-domains.json.gz", suffixes);
console.log(`  ${suffixes.length} suffixes`);
