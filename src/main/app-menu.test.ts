// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAC_PRODUCT_NAME, macApplicationMenuTemplate } from "./app-menu";

describe("macApplicationMenuTemplate", () => {
  const [appMenu, editMenu, windowMenu] = macApplicationMenuTemplate();
  const appItems = appMenu.submenu as Electron.MenuItemConstructorOptions[];

  it("names the about, hide and quit items after the product instead of app.name", () => {
    expect(appItems.filter((item) => item.label).map((item) => [item.role, item.label])).toEqual([
      ["about", "About Multi CLI Work"],
      ["hide", "Hide Multi CLI Work"],
      ["quit", "Quit Multi CLI Work"],
    ]);
  });

  it("keeps Electron 43.2.0's default appMenu items in order so their actions and shortcuts stay native", () => {
    expect(appMenu.role).toBe("appMenu");
    expect(appItems.map((item) => item.role ?? item.type)).toEqual([
      "about",
      "separator",
      "services",
      "separator",
      "hide",
      "hideOthers",
      "unhide",
      "separator",
      "quit",
    ]);
    expect([editMenu.role, windowMenu.role]).toEqual(["editMenu", "windowMenu"]);
  });

  it("uses the bundle's product name", () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"));
    expect(MAC_PRODUCT_NAME).toBe(manifest.build.productName);
  });
});
