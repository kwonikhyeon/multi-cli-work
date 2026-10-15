// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock(...) below is hoisted above these consts, so the values the factories close over must be
// created through vi.hoisted to be hoisted together with it.
const { autoUpdaterMock, openExternalMock, createUpdaterLoggerMock } = vi.hoisted(() => ({
  autoUpdaterMock: {
    on: vi.fn(),
    logger: undefined as unknown,
    checkForUpdatesAndNotify: vi.fn().mockResolvedValue(undefined),
    checkForUpdates: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    autoDownload: false,
    autoInstallOnAppQuit: false,
    disableWebInstaller: false,
  },
  openExternalMock: vi.fn().mockResolvedValue(undefined),
  createUpdaterLoggerMock: vi.fn().mockReturnValue({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

// electron-updater ships a default export; updater.ts destructures `autoUpdater` from it.
vi.mock("electron-updater", () => ({ default: { autoUpdater: autoUpdaterMock } }));

vi.mock("electron", () => ({
  app: { isPackaged: true, getPath: vi.fn().mockReturnValue("/tmp/multi-cli-work-updater-test") },
  shell: { openExternal: openExternalMock },
}));

// A real logger touches the filesystem (mkdir/append); the darwin guard must never reach it anyway,
// and the Windows path only needs *a* logger object to assign, not a working one.
vi.mock("./updater-log", () => ({ createUpdaterLogger: createUpdaterLoggerMock }));

import { checkForUpdates, initUpdater, updaterStatus } from "./updater";

const RELEASES_URL = "https://github.com/rafaam11/multi-cli-work/releases/latest";
const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  setPlatform(originalPlatform);
});

describe("서명 없는 macOS 빌드의 업데이터", () => {
  it("initUpdater는 electron-updater를 전혀 건드리지 않고 manual 상태만 알린다", () => {
    setPlatform("darwin");

    initUpdater();

    expect(autoUpdaterMock.on).not.toHaveBeenCalled();
    expect(updaterStatus()).toEqual({ state: "manual" });
  });

  it("checkForUpdates는 electron-updater 대신 릴리스 페이지를 열고 manual 상태를 알린다", async () => {
    setPlatform("darwin");

    await checkForUpdates();

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();
    expect(openExternalMock).toHaveBeenCalledOnce();
    expect(openExternalMock).toHaveBeenCalledWith(RELEASES_URL);
    expect(updaterStatus()).toEqual({ state: "manual" });
  });
});

describe("서명된 플랫폼(Windows)의 업데이터 — 기존 동작 유지", () => {
  it("initUpdater는 그대로 electron-updater 리스너를 등록한다", () => {
    setPlatform("win32");

    initUpdater({ autoCheck: false });

    expect(autoUpdaterMock.on).toHaveBeenCalled();
  });

  it("checkForUpdates는 그대로 electron-updater로 직접 확인하고 릴리스 페이지는 열지 않는다", async () => {
    setPlatform("win32");

    await checkForUpdates();

    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledOnce();
    expect(openExternalMock).not.toHaveBeenCalled();
  });
});
