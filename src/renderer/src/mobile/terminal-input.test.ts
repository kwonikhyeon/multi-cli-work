import { describe, expect, it } from "vitest";
import { clipboardKeyAction, createReplayGate, encodeComposerInput, isApplePlatform, QUICK_KEYS } from "./terminal-input";

describe("encodeComposerInput", () => {
  it("sends a single line followed by Enter", () => {
    expect(encodeComposerInput("hello")).toBe("hello\r");
  });
  it("wraps multi-line text in bracketed paste, then presses Enter", () => {
    expect(encodeComposerInput("a\r\nb\nc")).toBe("\x1b[200~a\rb\rc\x1b[201~\r");
  });
  it("an empty composer is just Enter", () => {
    expect(encodeComposerInput("")).toBe("\r");
  });
});

describe("QUICK_KEYS", () => {
  it("covers the approval keys", () => {
    expect(QUICK_KEYS.map((key) => key.label)).toEqual([
      "Esc",
      "Tab",
      "←",
      "→",
      "↑",
      "↓",
      "Enter",
      "^C",
      "1",
      "2",
      "3",
      "/",
    ]);
    expect(QUICK_KEYS.find((key) => key.label === "^C")!.data).toBe("\x03");
    expect(QUICK_KEYS.find((key) => key.label === "←")!.data).toBe("\x1b[D");
    expect(QUICK_KEYS.find((key) => key.label === "→")!.data).toBe("\x1b[C");
  });
});

describe("createReplayGate", () => {
  it("buffers output until the replay lands and drops what the replay already holds", () => {
    const written: string[] = [];
    const gate = createReplayGate((data) => written.push(data));
    gate.data("old", 4);
    gate.data("new", 6);
    gate.attached("REPLAY", 5);
    gate.data("next", 7);
    gate.data("dup", 7);
    expect(written).toEqual(["REPLAY", "new", "next"]);
  });

  it("starts over after reset (reconnect)", () => {
    const written: string[] = [];
    const gate = createReplayGate((data) => written.push(data));
    gate.attached("A", 1);
    gate.reset();
    gate.data("while-away", 9);
    gate.attached("B", 8);
    expect(written).toEqual(["A", "B", "while-away"]);
  });
});

describe("isApplePlatform", () => {
  it("takes every Mac navigator.platform string", () => {
    expect(isApplePlatform("MacIntel")).toBe(true);
    expect(isApplePlatform("MacPPC")).toBe(true);
  });

  it("takes iPhone/iPad/iPod, including iPadOS 13+'s MacIntel disguise", () => {
    expect(isApplePlatform("iPhone")).toBe(true);
    expect(isApplePlatform("iPad")).toBe(true);
    expect(isApplePlatform("iPod")).toBe(true);
    // iPadOS 13+는 "데스크톱 사이트 요청"과 무관하게 MacIntel로 나오지만, 위 MacIntel 케이스와 같은
    // 경로로 이미 true다 — 하드웨어 키보드의 복사·붙여넣기가 Cmd 하나뿐인 것도 Mac과 같다.
  });

  it("leaves Windows and Linux alone", () => {
    expect(isApplePlatform("Win32")).toBe(false);
    expect(isApplePlatform("Linux x86_64")).toBe(false);
  });
});

describe("clipboardKeyAction", () => {
  const key = (code: string, modifiers: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
    code,
    key: code,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...modifiers,
  });

  it("copies with Ctrl+C only when something is selected", () => {
    expect(clipboardKeyAction(key("KeyC", { ctrlKey: true }), true, false)).toBe("copy");
    // 선택이 없으면 Ctrl+C는 인터럽트로 PTY에 간다.
    expect(clipboardKeyAction(key("KeyC", { ctrlKey: true }), false, false)).toBeNull();
  });

  it("always takes Ctrl+Shift+C as the copy key", () => {
    expect(clipboardKeyAction(key("KeyC", { ctrlKey: true, shiftKey: true }), true, false)).toBe("copy");
    expect(clipboardKeyAction(key("KeyC", { ctrlKey: true, shiftKey: true }), false, false)).toBe("swallow");
  });

  it("pastes with Ctrl+V and Ctrl+Shift+V", () => {
    expect(clipboardKeyAction(key("KeyV", { ctrlKey: true }), false, false)).toBe("paste");
    expect(clipboardKeyAction(key("KeyV", { ctrlKey: true, shiftKey: true }), true, false)).toBe("paste");
  });

  it("leaves every other key to the terminal", () => {
    expect(clipboardKeyAction(key("KeyC"), true, false)).toBeNull();
    expect(clipboardKeyAction(key("KeyV", { ctrlKey: true, altKey: true }), false, false)).toBeNull();
    expect(clipboardKeyAction(key("KeyC", { ctrlKey: true, metaKey: true }), true, false)).toBeNull();
    expect(clipboardKeyAction(key("KeyX", { ctrlKey: true }), true, false)).toBeNull();
  });

  it("on Apple platforms, every Ctrl combination is left to the terminal — only Cmd is the clipboard key", () => {
    // Cmd+C/Cmd+V는 isApple과 무관하게 metaKey 분기에서 이미 null이다(그 키는 손대지 않는다).
    // 여기서 확인하는 것은 isApple이 Ctrl 쪽을 전부 꺼서, 선택이 있어도 Ctrl+C가 복사로 먹히지
    // 않고 그대로 인터럽트로(렌더러 쪽에서 null → true → PTY) 흘러가는 것이다.
    expect(clipboardKeyAction(key("KeyC", { ctrlKey: true }), true, true)).toBeNull();
    expect(clipboardKeyAction(key("KeyC", { ctrlKey: true, shiftKey: true }), true, true)).toBeNull();
    expect(clipboardKeyAction(key("KeyV", { ctrlKey: true }), false, true)).toBeNull();
    expect(clipboardKeyAction(key("KeyV", { ctrlKey: true, shiftKey: true }), true, true)).toBeNull();
  });
});
