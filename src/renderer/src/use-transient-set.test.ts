import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTransientSet } from "./use-transient-set";

describe("useTransientSet", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("holds a flashed value until its duration runs out", () => {
    const { result } = renderHook(() => useTransientSet<string, string>(1000));
    act(() => result.current.flash("a", "completed"));
    expect(result.current.map.get("a")).toBe("completed");

    act(() => vi.advanceTimersByTime(999));
    expect(result.current.map.has("a")).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.map.has("a")).toBe(false);
  });

  it("restarts a key's clock when it is flashed again", () => {
    const { result } = renderHook(() => useTransientSet<string, string>(1000));
    act(() => result.current.flash("a", "completed"));
    act(() => vi.advanceTimersByTime(600));
    act(() => result.current.flash("a", "failed"));
    act(() => vi.advanceTimersByTime(600));
    expect(result.current.map.get("a")).toBe("failed");
    act(() => vi.advanceTimersByTime(400));
    expect(result.current.map.has("a")).toBe(false);
  });

  it("times each key independently", () => {
    const { result } = renderHook(() => useTransientSet<string, string>(1000));
    act(() => result.current.flash("a", "completed"));
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.flash("b", "completed"));
    act(() => vi.advanceTimersByTime(500));
    expect([...result.current.map.keys()]).toEqual(["b"]);
  });

  it("drops a key early on clear", () => {
    const { result } = renderHook(() => useTransientSet<string, string>(1000));
    act(() => result.current.flash("a", "completed"));
    act(() => result.current.clear("a"));
    expect(result.current.map.has("a")).toBe(false);
  });

  it("leaves no timer behind after unmount", () => {
    const { result, unmount } = renderHook(() => useTransientSet<string, string>(1000));
    act(() => result.current.flash("a", "completed"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
