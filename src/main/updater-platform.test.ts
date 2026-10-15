// @vitest-environment node

import { describe, expect, it } from "vitest";
import { updaterSupported } from "./updater-platform";

describe("updaterSupported", () => {
  it("서명 없는 macOS 빌드는 자동 업데이트가 없다", () => {
    expect(updaterSupported("darwin")).toBe(false);
    expect(updaterSupported("win32")).toBe(true);
    expect(updaterSupported("linux")).toBe(true);
  });
});
