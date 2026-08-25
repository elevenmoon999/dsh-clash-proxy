import { readFileSync, writeFileSync } from "node:fs";

const buf = readFileSync(new URL("../.clash-test/vmess-spec.html", import.meta.url));
let html = buf.toString("utf8");
html = html.replace(/&#x([0-9A-Fa-f]{2,6});/g, (match, hex) => String.fromCodePoint(parseInt(hex, 16)));
let text = html
	.replace(/<script[\s\S]*?<\/script>/gi, " ")
	.replace(/<style[\s\S]*?<\/style>/gi, " ")
	.replace(/<[^>]+>/g, " ")
	.replace(/&nbsp;/g, " ")
	.replace(/&lt;/g, "<")
	.replace(/&gt;/g, ">")
	.replace(/&amp;/g, "&")
	.replace(/&apos;/g, "'")
	.replace(/&quot;/g, '"')
	.replace(/\s+/g, " ");
const start = text.indexOf("客户端请求");
const end = text.indexOf("服务器端响应", start);
const section = text.slice(start, end !== -1 ? end : start + 6000);
writeFileSync(new URL("../.clash-test/vmess-request.txt", import.meta.url), section, "utf8");
console.log(section);
