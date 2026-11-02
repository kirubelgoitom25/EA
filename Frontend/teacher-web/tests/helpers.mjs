// Loads project modules (JSX included) through Vite in Node, with no browser and no extra packages.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";

let server;
export async function loadModule(path) {
  server ??= await createServer({
    // Test files run in parallel processes: no shared websocket port, no shared dependency cache.
    server: { middlewareMode: true, hmr: false, ws: false },
    cacheDir: mkdtempSync(join(tmpdir(), "teacher-web-vite-")),
    appType: "custom",
    logLevel: "error",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  return server.ssrLoadModule(path);
}
export async function closeServer() {
  await server?.close();
  server = undefined;
}

// Records every fetch the app makes and answers from a table of canned replies.
// Only used by tests to see which requests would be sent; the app itself never mocks.
export function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const call = {
      url: String(url),
      method: (options.method || "GET").toUpperCase(),
      body: options.body ? JSON.parse(options.body) : undefined,
    };
    calls.push(call);
    const { status = 200, json = {} } = (await handler(call)) ?? {};
    return new Response(status === 204 ? null : JSON.stringify(json), { status });
  };
  return calls;
}
