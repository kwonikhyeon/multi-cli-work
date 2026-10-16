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
 * 네이티브 코드가 낸 이벤트(before-quit, 창 close)를 막은 뒤 종료 요청을 시작한다.
 *
 * macOS의 Cmd+Q·Dock 종료·로그아웃은 네이티브 `terminate:`가 Electron `Browser::Quit()`을 직접 부르고, 그 안에서
 * before-quit이 나간다. 신호등 닫기 버튼은 네이티브 `windowShouldClose:`에서 close를 낸다. 리스너가 끝나면 C++로
 * 돌아가기 전에 마이크로태스크부터 비우므로, 확인할 세션이 없어 요청이 마이크로태스크만으로 끝나면 `app.quit()`이
 * 그 네이티브 호출 안에서 불린다. 안쪽 `app.quit()`이 세운 종료 상태를 바깥 호출이 지운다 — `Quit()`은 "막힘"
 * 결과로 덮어쓰고, 막힌 close는 `OnWindowCloseCancelled`가 종료를 취소한다. 창만 닫히고 앱은 남는다. 그래서
 * macOS에서는 다음 태스크로 미룬다.
 * Windows·Linux는 종전 그대로 requestQuit을 바로 부른다. 제목 표시줄 ✕(IPC)와 트레이 "종료"는 JS 콜백 안에서
 * 일어나 겹치지 않는다. Alt+F4 같은 네이티브 창 닫기와 Linux SIGTERM은 같은 겹침을 겪을 수 있다.
 */
export function requestQuitFromNativeEvent(
  platform: NodeJS.Platform,
  requestQuit: () => void,
  defer: (task: () => void) => void = (task) => setImmediate(task),
): void {
  if (platform === "darwin") defer(requestQuit);
  else requestQuit();
}
