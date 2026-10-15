// @vitest-environment node

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { RemoteConnection } from "./remote-session-hub";
import { startRemoteServer, type RunningRemoteServer } from "./remote-server";
import type { ShellArtifact } from "./shell-artifact";

const servers: RunningRemoteServer[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
});

async function rendererDir(withBundle = true) {
  const dir = await mkdtemp(path.join(tmpdir(), "mcw-renderer-"));
  if (withBundle) {
    await mkdir(path.join(dir, "assets"));
    await writeFile(path.join(dir, "mobile.html"), "<!doctype html><title>mobile</title>");
    await writeFile(path.join(dir, "assets", "mobile-abc.js"), "console.log(1)");
    await writeFile(path.join(dir, "apple-touch-icon.png"), "png");
  }
  return dir;
}

async function start(options: { withBundle?: boolean; pair?: () => Promise<never>; shell?: ShellArtifact | null } = {}) {
  const connections: RemoteConnection[] = [];
  const received: string[] = [];
  const hub = {
    open: vi.fn((connection: RemoteConnection) => {
      connections.push(connection);
      return { receive: (raw: string) => received.push(raw), closed: vi.fn() };
    }),
  };
  const pair = vi.fn(
    options.pair ??
      (async (code: string) =>
        code === "GOOD"
          ? { ok: true as const, response: { token: "t", deviceId: "d", hostId: "h", hostName: "PC" } }
          : { ok: false as const, reason: "invalid" as const }),
  );
  const server = await startRemoteServer({ host: "127.0.0.1", port: 0, rendererDir: await rendererDir(options.withBundle), hub, pair, shell: options.shell ?? null });
  servers.push(server);
  return { server, base: `http://127.0.0.1:${server.port}`, hub, pair, connections, received };
}

describe("startRemoteServer", () => {
  it("serves the mobile page and hashed assets", async () => {
    const { base } = await start();
    const page = await fetch(`${base}/mobile/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(page.headers.get("cache-control")).toBe("no-cache");
    const asset = await fetch(`${base}/mobile/assets/mobile-abc.js`);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    const root = await fetch(`${base}/`, { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/mobile/");
  });

  it("serves the apple touch icon from the renderer root", async () => {
    const { base } = await start();
    const response = await fetch(`${base}/mobile/apple-touch-icon.png`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    // 아이콘이 없는 번들에서는 404 — serveFile 실패 분기도 함께 고정한다.
    const { base: bare } = await start({ withBundle: false });
    expect((await fetch(`${bare}/mobile/apple-touch-icon.png`)).status).toBe(404);
  });

  it("refuses path traversal and unknown paths", async () => {
    const { base } = await start();
    expect((await fetch(`${base}/mobile/assets/..%2Fmobile.html`)).status).toBe(404);
    expect((await fetch(`${base}/mobile/assets/../../etc/passwd`)).status).toBe(404);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it("serves the bundled shell APK, its manifest, and an install page", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mcw-shell-"));
    await writeFile(path.join(dir, "shell.apk"), "APKBYTES");
    const shell = { release: { versionCode: 3, versionName: "0.3.0", sha256: "b".repeat(64) }, apkPath: path.join(dir, "shell.apk") };
    const { base } = await start({ shell });
    const manifest = await fetch(`${base}/shell.json`);
    expect(await manifest.json()).toEqual(shell.release);
    const apk = await fetch(`${base}/shell.apk`);
    expect(apk.headers.get("content-type")).toBe("application/vnd.android.package-archive");
    expect(apk.headers.get("content-disposition")).toContain("Multi-CLI-Work-Mobile-0.3.0.apk");
    expect(await apk.text()).toBe("APKBYTES");
    const install = await fetch(`${base}/install`);
    expect(install.headers.get("content-type")).toContain("text/html");
    const html = await install.text();
    expect(html).toContain('href="/shell.apk"');
    expect(html).toContain("0.3.0");
  });

  it("404s /shell.apk when the manifest exists but the APK file is gone", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mcw-shell-"));
    const shell = { release: { versionCode: 3, versionName: "0.3.0", sha256: "b".repeat(64) }, apkPath: path.join(dir, "shell.apk") };
    const { base } = await start({ shell });
    expect((await fetch(`${base}/shell.apk`)).status).toBe(404);
  });

  it("explains a missing shell on /install and 404s the rest", async () => {
    const { base } = await start({ shell: null });
    expect((await fetch(`${base}/shell.json`)).status).toBe(404);
    expect((await fetch(`${base}/shell.apk`)).status).toBe(404);
    const install = await fetch(`${base}/install`);
    expect(install.status).toBe(200);
    expect(await install.text()).toContain("모바일 앱이 들어 있지 않습니다");
  });

  it("install page explains the iPhone home-screen flow on both branches", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "mcw-shell-"));
    await writeFile(path.join(dir, "shell.apk"), "APKBYTES");
    const shell = { release: { versionCode: 3, versionName: "0.3.0", sha256: "b".repeat(64) }, apkPath: path.join(dir, "shell.apk") };

    const bundled = await start({ shell });
    const withApk = await (await fetch(`${bundled.base}/install`)).text();
    expect(withApk).toContain("홈 화면에 추가");
    expect(withApk).toContain('href="/mobile/"');
    expect(withApk).toContain("<h2>Android</h2>");

    // APK가 동봉되지 않은 빌드에서도 iPhone 절차는 남아야 한다.
    const bare = await start({ shell: null });
    expect(await (await fetch(`${bare.base}/install`)).text()).toContain("홈 화면에 추가");
  });

  it("503 when the mobile bundle is missing", async () => {
    const { base } = await start({ withBundle: false });
    const response = await fetch(`${base}/mobile/`);
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("npm run build");
  });

  it("pairs through POST /pair", async () => {
    const { base, pair } = await start();
    const ok = await fetch(`${base}/pair`, { method: "POST", body: JSON.stringify({ code: "GOOD", deviceName: "폰" }) });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ token: "t", deviceId: "d", hostId: "h", hostName: "PC" });
    expect(pair).toHaveBeenCalledWith("GOOD", "폰", "127.0.0.1");
    expect((await fetch(`${base}/pair`, { method: "POST", body: '{"code":"BAD","deviceName":"x"}' })).status).toBe(401);
    expect((await fetch(`${base}/pair`, { method: "POST", body: "nope" })).status).toBe(400);
  });

  it("maps a rate-limited pairing to 429", async () => {
    const { base } = await start({ pair: async () => ({ ok: false, reason: "rate-limited" }) as never });
    expect((await fetch(`${base}/pair`, { method: "POST", body: '{"code":"X","deviceName":"x"}' })).status).toBe(429);
  });

  it("hands WS text frames to the hub and sends hub messages back", async () => {
    const { server, connections, received } = await start();
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
    await new Promise((resolve) => socket.once("open", resolve));
    socket.send('{"type":"list"}');
    await vi.waitFor(() => expect(received).toEqual(['{"type":"list"}']));
    const message = new Promise<string>((resolve) => socket.once("message", (data) => resolve(String(data))));
    connections[0]!.send({ type: "sessions", sessions: [] });
    expect(JSON.parse(await message)).toEqual({ type: "sessions", sessions: [] });
    socket.close();
  });

  it("rejects a WS upgrade from a foreign origin or on another path", async () => {
    const { server } = await start();
    const foreign = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { headers: { Origin: "http://evil.example" } });
    await expect(new Promise((_, reject) => foreign.once("error", reject))).rejects.toThrow(/403/);
    const wrongPath = new WebSocket(`ws://127.0.0.1:${server.port}/other`);
    await expect(new Promise((_, reject) => wrongPath.once("error", reject))).rejects.toThrow(/404/);
  });

  it("accepts a same-origin WS upgrade", async () => {
    const { server } = await start();
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, {
      headers: { Origin: `http://127.0.0.1:${server.port}` },
    });
    await new Promise((resolve) => socket.once("open", resolve));
    socket.close();
  });
});
