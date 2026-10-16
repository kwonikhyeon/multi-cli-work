export interface QuitRequest {
  confirm(): Promise<boolean>;
  exit(): void;
}

/** One gate for menu quit, window-close quit, before-quit, and updater restart. */
export class QuitCoordinator {
  private requestPromise: Promise<void> | null = null;
  private disposePromise: Promise<void> | null = null;
  private committed = false;

  constructor(private readonly disposeRuntime: () => Promise<void>) {}

  isCommitted(): boolean {
    return this.committed;
  }

  request(request: QuitRequest): Promise<void> {
    if (this.requestPromise) return this.requestPromise;
    const pending = (async () => {
      if (!(await request.confirm())) return;
      if (!this.disposePromise) {
        try {
          this.disposePromise = Promise.resolve(this.disposeRuntime());
        } catch (error) {
          this.disposePromise = Promise.reject(error);
        }
      }
      const disposing = this.disposePromise;
      try {
        await disposing;
      } catch (error) {
        if (this.disposePromise === disposing) this.disposePromise = null;
        throw error;
      }
      this.committed = true;
      request.exit();
    })();
    this.requestPromise = pending;
    void pending.finally(() => {
      if (!this.committed && this.requestPromise === pending) this.requestPromise = null;
    }).catch(() => undefined);
    return pending;
  }
}

/**
 * before-quit을 막은 뒤 종료 요청을 시작한다.
 *
 * macOS의 Cmd+Q·Dock 종료·로그아웃은 네이티브 `terminate:`가 Electron `Browser::Quit()`을 직접 부르고, 그 안에서
 * before-quit이 나간다. 리스너가 끝나면 C++로 돌아가기 전에 마이크로태스크부터 비우므로, 확인할 세션이 없어 요청이
 * 마이크로태스크만으로 끝나면 `app.quit()`이 바깥 `Quit()` 안에서 다시 불린다. 안쪽 호출이 세운 종료 상태를 바깥
 * 호출이 "막힘" 결과로 덮어써서 창만 닫히고 앱은 남는다. 그래서 macOS에서는 다음 태스크로 미룬다.
 * Windows·Linux의 일상 종료 경로(트레이 "종료", 창 닫기)는 requestQuit을 직접 부르므로 종전 그대로 둔다.
 */
export function requestQuitFromBeforeQuit(
  platform: NodeJS.Platform,
  requestQuit: () => void,
  defer: (task: () => void) => void = (task) => setImmediate(task),
): void {
  if (platform === "darwin") defer(requestQuit);
  else requestQuit();
}
