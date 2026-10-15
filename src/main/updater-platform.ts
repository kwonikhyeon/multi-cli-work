export function quitAndInstallArguments(platform: NodeJS.Platform): [boolean, boolean] {
  return [platform === "win32", true];
}

export interface ConfigurableUpdater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  disableWebInstaller: boolean;
}

export function configureAutoUpdater(updater: ConfigurableUpdater): void {
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  // We ship the full NSIS installer only. Left false, the NSIS updater logs a warning on every run.
  updater.disableWebInstaller = true;
}

/** electron-updater는 서명된 macOS 빌드에서만 동작한다. 개인용(ad-hoc) 단계에서는 수동 안내로 대체한다. */
export function updaterSupported(platform: NodeJS.Platform): boolean {
  return platform !== "darwin";
}
