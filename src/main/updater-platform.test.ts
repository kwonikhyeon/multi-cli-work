// @vitest-environment node

import { describe, expect, it } from "vitest";
import { configureAutoUpdater, quitAndInstallArguments, updaterSupported } from "./updater-platform";

describe("updaterSupported", () => {
  it("서명 없는 macOS 빌드는 자동 업데이트가 없다", () => {
    expect(updaterSupported("darwin")).toBe(false);
    expect(updaterSupported("win32")).toBe(true);
    expect(updaterSupported("linux")).toBe(true);
  });
});

describe("updater restart", () => {
  it("uses silent NSIS only on Windows and always relaunches", () => {
    expect(quitAndInstallArguments("win32")).toEqual([true, true]);
    expect(quitAndInstallArguments("linux")).toEqual([false, true]);
  });
});

describe("updater configuration", () => {
  it("downloads and installs on quit, and says it never uses a web installer", () => {
    const updater = { autoDownload: false, autoInstallOnAppQuit: false, disableWebInstaller: false };
    configureAutoUpdater(updater);
    expect(updater).toEqual({ autoDownload: true, autoInstallOnAppQuit: true, disableWebInstaller: true });
  });
});
