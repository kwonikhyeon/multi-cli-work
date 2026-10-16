// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { QuitCoordinator, requestQuitFromNativeEvent } from "./quit-coordinator";

describe("QuitCoordinator", () => {
  it("shares concurrent quit/update requests and awaits disposal exactly once", async () => {
    let finishDispose!: () => void;
    const dispose = vi.fn(() => new Promise<void>((resolve) => { finishDispose = resolve; }));
    const coordinator = new QuitCoordinator(dispose);
    const quit = vi.fn();
    const update = vi.fn();

    const first = coordinator.request({ confirm: async () => true, exit: quit });
    const second = coordinator.request({ confirm: async () => true, exit: update });
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    finishDispose();
    await Promise.all([first, second]);
    expect(dispose).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(coordinator.isCommitted()).toBe(true);
  });

  it("allows a later request after confirmation is cancelled", async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    const coordinator = new QuitCoordinator(dispose);
    await coordinator.request({ confirm: async () => false, exit: vi.fn() });
    const exit = vi.fn();

    await coordinator.request({ confirm: async () => true, exit });

    expect(dispose).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });

  it.each(["rejects", "throws"])("allows retry after disposal %s", async (failure) => {
    const dispose = vi.fn()
      .mockImplementationOnce(() => {
        if (failure === "throws") throw new Error("dispose failed");
        return Promise.reject(new Error("dispose failed"));
      })
      .mockResolvedValueOnce(undefined);
    const coordinator = new QuitCoordinator(dispose);
    const exit = vi.fn();

    await expect(coordinator.request({ confirm: async () => true, exit })).rejects.toThrow("dispose failed");
    await expect(coordinator.request({ confirm: async () => true, exit })).resolves.toBeUndefined();

    expect(dispose).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenCalledOnce();
  });
});

/** 세션이 없을 때처럼 확인·정리가 곧바로 끝나는 종료 요청 — 마이크로태스크만으로 exit(app.quit)까지 간다. */
function instantQuitRequest() {
  const coordinator = new QuitCoordinator(async () => undefined);
  const exit = vi.fn();
  return { exit, requestQuit: () => void coordinator.request({ confirm: async () => true, exit }) };
}

/** setImmediate는 마이크로태스크 큐가 빈 뒤에 돈다 — 지금 태스크에서 이어지는 일을 모두 끝낸다. */
const finishCurrentTask = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("requestQuitFromNativeEvent", () => {
  it("defers on macOS so app.quit() never runs inside the native Quit() or close that fired the event", async () => {
    const { exit, requestQuit } = instantQuitRequest();
    const deferred: Array<() => void> = [];

    requestQuitFromNativeEvent("darwin", requestQuit, (task) => deferred.push(task));
    await finishCurrentTask();
    expect(exit).not.toHaveBeenCalled();

    for (const task of deferred) task();
    await finishCurrentTask();
    expect(exit).toHaveBeenCalledOnce();
  });

  it.each(["win32", "linux"] as const)("requests at once on %s, as before", async (platform) => {
    const { exit, requestQuit } = instantQuitRequest();
    const defer = vi.fn();

    requestQuitFromNativeEvent(platform, requestQuit, defer);
    await finishCurrentTask();

    expect(defer).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledOnce();
  });
});
