/**
 * The app draws its own title bar, so the platform's caption bar has to go. How much of the frame
 * goes with it differs: Windows keeps the border, shadow, resize handles and drag snapping when
 * only the caption is hidden. macOS keeps the traffic lights by hiding only the title bar
 * (hiddenInset insets them below the custom bar). Linux ignores titleBarStyle entirely, so there
 * the frame is the only lever.
 */
export type WindowChrome = Pick<Electron.BrowserWindowConstructorOptions, "frame" | "titleBarStyle">;

export function windowChromeOptions(platform: NodeJS.Platform): WindowChrome {
  if (platform === "win32") return { titleBarStyle: "hidden" };
  if (platform === "darwin") return { titleBarStyle: "hiddenInset" };
  return { frame: false };
}
