import { _electron as electron, expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("session activity stays distinct from focus, progress and reduced motion", async ({}, testInfo) => {
  test.setTimeout(90_000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mcw-activity-"));
  const userData = path.join(root, "user-data");
  const projectId = "11111111-1111-4111-8111-111111111111";
  const now = new Date().toISOString();
  const ids = Array.from({ length: 12 }, (_, index) => `activity-${index + 1}`);
  const view = { layoutId: "cols:2-2-2-2-2-2", slots: ids };
  await fs.mkdir(userData);
  await fs.writeFile(path.join(root, "projects.json"), JSON.stringify({
    schemaVersion: 1, updatedAt: now, projects: {
      [projectId]: {
        id: projectId, rootPath: root, displayName: "Activity Test", sources: ["manual"],
        providerRefs: { claude: [], codex: [] }, status: null, memo: "", tracks: [],
        hidden: false, order: 0, createdAt: now, updatedAt: now,
      },
    },
  }));
  // Restored, finished sessions avoid launching CLIs. Only status/progress reports are simulated;
  // React, the real preload subscriptions, xterm, layout, settings and Chromium CSS all run normally.
  await fs.writeFile(path.join(userData, "state.json"), JSON.stringify({
    schemaVersion: 1, updatedAt: now, selectedProjectId: projectId, selectedSessionId: ids[0],
    folderViews: { [projectId]: view }, workspace: view,
    sessions: Object.fromEntries(ids.map((id, index) => [id, {
      id, projectId, tool: null, title: null, name: `Session ${index + 1}`,
      kind: process.platform === "win32" ? "powershell" : process.platform === "darwin" ? "zsh" : "bash",
      cwd: root, providerConversationId: null, interruptedByShutdown: false, createdAt: now, updatedAt: now,
    }])),
  }));
  const app = await electron.launch({
    args: [path.resolve("out/main/index.js")],
    env: {
      ...process.env,
      MULTI_CLI_WORK_USER_DATA: userData,
      ...Object.fromEntries([
        ["REGISTRY_PATH", "projects.json"], ["WORKSPACE_PATH", "workspace.json"],
        ["AGENTS_PATH", "agents.json"], ["WORK_PROJECTS_PATH", "work-projects.json"],
        ["WORKTREES_PATH", "worktrees.json"], ["WORKTREE_SCRIPTS_PATH", "scripts.json"],
        ["PROJECT_TAGS_PATH", "tags.json"], ["PR_REVIEWS_PATH", "reviews.json"],
        ["CLAUDE_CONFIG_DIR", "claude-config"], ["CLAUDE_PROJECTS_DIR", "claude-projects"],
        ["CODEX_SESSIONS_DIR", "codex-sessions"],
      ].map(([key, name]) => [`MULTI_CLI_WORK_${key}`, path.join(root, name)])),
    },
  });
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 2560, height: 1100 });
    const first = page.locator('.grid-pane[aria-label="Session 1"]');
    await expect(page.locator(".grid-pane")).toHaveCount(12);
    // Attach must finish before simulated reports, since attach returns the saved exited status.
    await expect(page.locator(".terminal-host .xterm")).toHaveCount(12);
    await expect(page.locator(".terminal-progress")).toHaveCount(0);
    await expect(first).toHaveClass(/status-exited/);
    const report = async (status: string, sessionIds = [ids[0]]) => {
      await app.evaluate(({ BrowserWindow }, { status, sessionIds }) => {
        const window = BrowserWindow.getAllWindows()[0];
        sessionIds.forEach((sessionId) => window.webContents.send("terminal:event", { type: "status", sessionId, status }));
      }, { status, sessionIds });
    };
    await report("working", ids);
    await expect(page.locator(".pane-activity")).toHaveCount(12);
    await expect(first.locator(".pane-working-badge")).toHaveText("작업 중");
    await expect(first.locator(".pane-activity")).toHaveCSS("pointer-events", "none");
    const edge = first.locator(".pane-activity-top");
    await expect.poll(() => edge.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("pane-activity-horizontal");
    const before = await edge.evaluate((element) => getComputedStyle(element, "::before").transform);
    await expect.poll(() => edge.evaluate((element) => getComputedStyle(element, "::before").transform)).not.toBe(before);
    const row = page.locator(".session-panel-list .session-row.status-working").first();
    await expect(row.locator(".session-status")).toHaveText("작업 중");
    await expect.poll(() => row.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("session-row-activity");

    await app.evaluate(({ BrowserWindow }, sessionId) => {
      BrowserWindow.getAllWindows()[0].webContents.send("terminals:indicators", {
        sessionId, indicators: { progress: { state: "normal", value: 40 }, chips: [] },
      });
    }, ids[0]);
    await expect(first.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    await expect(first.locator(".pane-activity")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("activity-dark-12.png") });

    for (const status of ["awaiting-input", "awaiting-approval", "error", "exited", "idle", "starting"]) {
      await report(status);
      await expect(first).toHaveClass(new RegExp(`status-${status}`));
      await expect(first.locator(".pane-activity, .pane-working-badge")).toHaveCount(0);
    }
    await report("working");
    await expect(first.locator(".pane-activity")).toBeVisible();
    await first.locator(".terminal-surface").click();
    await expect(first).toHaveClass(/pane-focused/);

    await page.evaluate(() => window.multiCliWork.settings.update({ appearance: { theme: "light" } }));
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.screenshot({ path: testInfo.outputPath("activity-light-12.png") });
    for (const mode of ["os", "app"] as const) {
      if (mode === "os") await page.emulateMedia({ reducedMotion: "reduce" });
      else {
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.evaluate(() => window.multiCliWork.settings.update({ general: { reduceMotion: true } }));
        await expect(page.locator("html")).toHaveAttribute("data-reduce-motion", "");
      }
      await expect.poll(() => edge.evaluate((element) => getComputedStyle(element, "::before").display)).toBe("none");
      await expect(first.locator(".pane-working-badge svg")).toHaveCSS("animation-name", "none");
      await expect.poll(() => row.evaluate((element) => getComputedStyle(element, "::before").animationName)).toBe("none");
      await expect(first.locator(".pane-activity")).toBeVisible();
      await expect(first.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40");
    }
    await page.evaluate(() => window.multiCliWork.settings.update({
      appearance: { theme: "dark" }, general: { reduceMotion: false },
    }));
    await first.getByRole("button", { name: "패인 확대", exact: true }).click();
    await expect(page.locator(".workspace-grid")).toHaveAttribute("data-zoomed", "true");
    await expect(first.locator(".pane-activity")).toBeVisible();
    await first.getByRole("button", { name: "확대 해제", exact: true }).click();
    await page.getByRole("radio", { name: "1열", exact: true }).click();
    await expect(page.locator(".workspace-grid")).toHaveAttribute("data-slots", "1");
    await expect(page.locator(".pane-activity:visible")).toHaveCount(1);
    await page.getByRole("radio", { name: "2열", exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 820 });
    await expect(page.locator(".terminal-progress")).toHaveCount(0);
    await report("working", ids);
    await expect(page.locator(".pane-activity:visible")).toHaveCount(2);
    for (const header of await page.locator(".pane-header-main").all()) {
      expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath("activity-dark-2.png") });
  } finally {
    await app.close();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
