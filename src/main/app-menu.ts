/**
 * The bundle name macOS shows in the menu bar, Dock and Finder (package.json `build.productName`).
 * `app.name` stays the package `name` ("multi-cli-work") because the userData path and the
 * Keychain item ("multi-cli-work Safe Storage") are derived from it, so only the menu labels that
 * Electron builds from `app.name` are rewritten with this name.
 */
export const MAC_PRODUCT_NAME = "Multi CLI Work";

/**
 * The renderer draws its own menu bar. On macOS the system menu bar still has to exist for
 * Cmd+Q/C/V/H/M and dictation to work, so this is Electron's appMenu/editMenu/windowMenu trio with
 * the appMenu items spelled out: the roles keep their native actions and shortcuts, and only the
 * items whose default label embeds `app.name` get a label.
 * The spelled-out list copies Electron 43.2.0's default appMenu. The unit tests run without Electron
 * and cannot compare against that default, so re-check it against Electron's menu-item-roles when
 * upgrading Electron.
 */
export function macApplicationMenuTemplate(): Electron.MenuItemConstructorOptions[] {
  return [
    {
      role: "appMenu",
      label: MAC_PRODUCT_NAME,
      submenu: [
        { role: "about", label: `About ${MAC_PRODUCT_NAME}` },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide", label: `Hide ${MAC_PRODUCT_NAME}` },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit", label: `Quit ${MAC_PRODUCT_NAME}` },
      ],
    },
    { role: "editMenu" },
    { role: "windowMenu" },
  ];
}
