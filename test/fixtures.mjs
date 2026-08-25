import net from "node:net";
import { connectThrough, ssSubkey, ssSeal, ssOpen, makeSsNonce } from "../lib/core/transports.js";

/**
 * Test fixtures: minimal protocol servers that let the e2e test exercise the
 * real client transports without an airport subscription.
 *
 * Both fixtures dial their targets through `TEST_UPSTREAM_PROXY` when set
 * (an http proxy like a local Clash mixed port), so tests can reach the
 * international internet on any network; otherwise they connect directly.
 * @module dsh-clash-proxy/test-fixtures
 */

/** Dial a target for fixtures: direct, or via TEST_UPSTREAM_PROXY. */
export async function dialFace(host, port) {
	const proxy = process.env.TEST_UPSTREAM_PROXY ?? "";
	if (proxy.length > 0) {
		const url = new URL(proxy);
		return connectThrough({
			type: "http",
			server: url.hostname,
			port: Number(url.port) || 80,
			username: url.username || undefined,
			password: url.password || undefined
		}, host, port);
	}
	return connectThrough(null, host, port);
}

/** Parse a SOCKS-style address [atyp][addr][port] from a buffer. */
export function parseEncodedAddr(buffer) {
	const atyp = buffer[0];
	let host;
	let portOffset;
	if (atyp === 0x01) {
		host = [...buffer.subarray(1, 5)].join(".");
		portOffset = 5;
	} else if (atyp === 0x03) {
		const length = buffer[1];
		host = buffer.subarray(2, 2 + length).toString("utf8");
		portOffset = 2 + length;
	} else if (atyp === 0x04) {
		const groups = [];
		for (let i = 0; i < 8; i++) groups.push(buffer.subarray(1 + i * 2, 3 + i * 2).toString("hex"));
		host = groups.join(":").replace(/(^|:)0(:0)+(:|$)/, "::");
		portOffset = 17;
	} else {
		throw new Error(`unsupported atyp ${atyp}`);
	}
	const port = buffer.readUInt16BE(portOffset);
	return { host, port, rest: buffer.subarray(portOffset + 2) };
}

/** One chunk from a socket. */
function nextChunk(socket) {
	return new Promise((resolve, reject) => {
		const onData = (data) => {
			cleanup();
			resolve(data);
		};
		const onClose = () => {
			cleanup();
			resolve(null);
		};
		const onError = (error) => {
			cleanup();
			reject(error);
		};
		const cleanup = () => {
			socket.off("data", onData);
			socket.off("close", onClose);
			socket.off("error", onError);
		};
		socket.once("data", onData);
		socket.once("close", onClose);
		socket.once("error", onError);
	});
}

/** Minimal SOCKS5 server (no-auth only). @returns { port, close }. */
export function startSocks5Server() {
	const server = net.createServer((client) => {
		client.on("error", () => {});
		const handle = async () => {
			const greeting = await nextChunk(client);
			if (greeting === null || greeting[0] !== 0x05) return client.destroy();
			const methods = [...greeting.subarray(2, 2 + greeting[1])];
			if (!methods.includes(0x00)) {
				client.end(Buffer.from([0x05, 0xff]));
				return;
			}
			client.write(Buffer.from([0x05, 0x00]));
			const request = await nextChunk(client);
			if (request === null) return client.destroy();
			const { host, port, rest } = parseEncodedAddr(request.subarray(3));
			if (request[1] !== 0x01) return client.destroy();
			let face;
			try {
				face = await dialFace(host, port);
			} catch {
				client.end(Buffer.from([0x05, 0x05, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
				return;
			}
			client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
			if (rest.length > 0) face.write(rest);
			client.on("data", (chunk) => face.write(chunk));
			client.on("close", () => face.close());
			(async () => {
				for await (const chunk of face.read) client.write(chunk);
			})().catch(() => client.destroy());
		};
		void handle();
	});
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
		port: server.address().port,
		close: () => server.close()
	})));
}

/** Minimal shadowsocks AEAD server (aes-256-gcm only). @returns { port, close }. */
export function startSsServer(password) {
	const CIPHER = "aes-256-gcm";
	const server = net.createServer((client) => {
		client.on("error", () => {});
		let buffer = Buffer.alloc(0);
		let key = null;
		let upstream = null;
		const inNonce = makeSsNonce();
		const outNonce = makeSsNonce();
		const read = async (count) => {
			while (buffer.length < count) {
				const chunk = await nextChunk(client);
				if (chunk === null) throw new Error("client closed");
				buffer = Buffer.concat([buffer, chunk]);
			}
			const out = buffer.subarray(0, count);
			buffer = buffer.subarray(count);
			return out;
		};
		const handle = async () => {
			const salt = await read(32);
			key = ssSubkey(password, salt, CIPHER);
			// First frame: the client's address chunk (length covers cipher+tag).
			const length = (await read(2)).readUInt16BE(0);
			const first = await read(length);
			const address = ssOpen(CIPHER, key, inNonce.next(), first);
			const { host, port, rest } = parseEncodedAddr(address);
			upstream = await dialFace(host, port);
			if (rest.length > 0) upstream.write(rest);
			(async () => {
				for await (const chunk of upstream.read) {
					if (client.destroyed) return;
					const sealed = ssSeal(CIPHER, key, outNonce.next(), chunk);
					client.write(Buffer.concat([Buffer.from([sealed.length >> 8, sealed.length & 0xff]), sealed]));
				}
			})().catch(() => client.destroy());
			for (;;) {
				const frameLength = (await read(2)).readUInt16BE(0);
				const sealed = await read(frameLength);
				const plain = ssOpen(CIPHER, key, inNonce.next(), sealed);
				if (!client.destroyed) upstream.write(plain);
			}
		};
		handle().catch((error) => {
			if (error?.message !== "client closed") {
				// eslint-disable-next-line no-console
				console.error("[ss-fixture] flow error:", error?.message ?? error);
			}
			client.destroy();
			upstream?.close();
		});
		client.on("close", () => upstream?.close());
	});
	return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
		port: server.address().port,
		close: () => server.close()
	})));
}
