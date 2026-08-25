import { createServer } from "node:http";

// Synthetic subscription server for isolated-instance tests.
const port = Number(process.argv[2] ?? "17777");
createServer((req, res) => {
	res.writeHead(200, { "content-type": "text/yaml" });
	res.end("proxies:\n  - name: upstream-clash\n    type: http\n    server: 127.0.0.1\n    port: 7890\nrules:\n  - DOMAIN-SUFFIX,cn,DIRECT\n");
}).listen(port, "127.0.0.1", () => {
	console.log(`subscription server on 127.0.0.1:${port}`);
});
