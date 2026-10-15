// @vitest-environment node

import { describe, expect, it } from "vitest";
import { windowChromeOptions } from "./window-chrome";

describe("windowChromeOptions", () => {
  it("hides only the caption bar on Windows so the native frame survives", () => {
    expect(windowChromeOptions("win32")).toEqual({ titleBarStyle: "hidden" });
  });

  it("drops the frame on Linux, because titleBarStyle is a no-op there", () => {
    expect(windowChromeOptions("linux")).toEqual({ frame: false });
  });

  it("keeps the traffic lights on macOS by hiding only the title bar", () => {
    expect(windowChromeOptions("darwin")).toEqual({ titleBarStyle: "hiddenInset" });
  });
});
