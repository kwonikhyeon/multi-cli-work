import { describe, expect, it } from "vitest";
import {
  KEYMAP_ACTIONS,
  defaultAcceleratorFor,
  effectiveAccelerator,
  findConflict,
  isBindableAccelerator,
  isTypingTarget,
  normalizeKeyEvent,
  resolveKeymap,
} from "./keymap";

describe("normalizeKeyEvent", () => {
  const event = (key: string, modifiers: Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  });

  it("수식어를 Ctrl→Alt→Shift 순으로 표기하고 meta는 Ctrl로 접는다", () => {
    expect(normalizeKeyEvent(event("Tab", { ctrlKey: true, shiftKey: true }), "win32")).toBe("Ctrl+Shift+Tab");
    expect(normalizeKeyEvent(event("p", { metaKey: true }), "win32")).toBe("Ctrl+P");
    expect(normalizeKeyEvent(event("k", { ctrlKey: true, altKey: true, shiftKey: true }), "win32")).toBe("Ctrl+Alt+Shift+K");
  });

  it("Shift 글리프(+, _)는 기본 키로 되돌리고 Shift 표기를 없앤다 — 현행 줌 키와 일치", () => {
    expect(normalizeKeyEvent(event("+", { ctrlKey: true, shiftKey: true }), "win32")).toBe("Ctrl+=");
    expect(normalizeKeyEvent(event("_", { ctrlKey: true, shiftKey: true }), "win32")).toBe("Ctrl+-");
    expect(normalizeKeyEvent(event("=", { ctrlKey: true }), "win32")).toBe("Ctrl+=");
  });

  it("기능키는 단독으로, 수식어 단독은 null", () => {
    expect(normalizeKeyEvent(event("F5"), "win32")).toBe("F5");
    expect(normalizeKeyEvent(event("F11"), "win32")).toBe("F11");
    expect(normalizeKeyEvent(event("Control", { ctrlKey: true }), "win32")).toBeNull();
    expect(normalizeKeyEvent(event("Shift", { shiftKey: true }), "win32")).toBeNull();
  });

  it("숫자와 쉼표", () => {
    expect(normalizeKeyEvent(event("1", { ctrlKey: true }), "win32")).toBe("Ctrl+1");
    expect(normalizeKeyEvent(event(",", { ctrlKey: true }), "win32")).toBe("Ctrl+,");
  });
});

describe("키맵 카탈로그", () => {
  it("기본 키맵에 충돌이 없다", () => {
    const seen = new Map<string, string>();
    for (const action of KEYMAP_ACTIONS) {
      if (!action.defaultAccelerator) continue;
      expect(seen.get(action.defaultAccelerator), `${action.id} vs ${seen.get(action.defaultAccelerator)}`).toBeUndefined();
      seen.set(action.defaultAccelerator, action.id);
    }
  });

  it("스펙의 기본 키맵을 그대로 싣는다", () => {
    const byId = new Map(KEYMAP_ACTIONS.map((action) => [action.id, action]));
    expect(byId.get("view.quick-open")?.defaultAccelerator).toBe("Ctrl+P");
    expect(byId.get("file.save")?.defaultAccelerator).toBe("Ctrl+S");
    expect(byId.get("settings.open")?.defaultAccelerator).toBe("Ctrl+,");
    expect(byId.get("file.refresh")?.defaultAccelerator).toBe("F5");
    expect(byId.get("session.refresh")?.defaultAccelerator).toBeNull();
    expect(byId.get("session.next")?.defaultAccelerator).toBe("Ctrl+Tab");
    expect(byId.get("session.prev")?.defaultAccelerator).toBe("Ctrl+Shift+Tab");
    expect(byId.get("workspace.focus-slot-1")?.defaultAccelerator).toBe("Ctrl+1");
    expect(byId.get("workspace.focus-slot-9")?.defaultAccelerator).toBe("Ctrl+9");
    expect(byId.get("workspace.focus-slot-10")).toBeUndefined(); // Ctrl+0은 줌 리셋 소유
    expect(byId.get("view.reload")?.defaultAccelerator).toBeNull(); // Ctrl+R은 의도적으로 없음
    expect(byId.get("edit.copy")).toMatchObject({ defaultAccelerator: "Ctrl+Shift+C", fixed: true });
    expect(byId.get("edit.paste")).toMatchObject({ defaultAccelerator: "Ctrl+V", fixed: true });
    expect(byId.get("edit.select-all")).toMatchObject({ defaultAccelerator: "Ctrl+A", fixed: true });
    // 터미널 안의 Ctrl+F는 TerminalPane이 잡는다 — 디스패처가 가로채면 반쪽 리매핑이 된다.
    expect(byId.get("edit.find")).toMatchObject({ defaultAccelerator: "Ctrl+F", fixed: true });
  });
});

describe("resolveKeymap / effectiveAccelerator / findConflict", () => {
  it("오버라이드가 기본값을 대체하고 null은 해제한다", () => {
    const keymap = resolveKeymap({ "view.quick-open": "Ctrl+K", "file.refresh": null }, "win32");
    expect(keymap.get("Ctrl+K")?.id).toBe("view.quick-open");
    expect(keymap.get("Ctrl+P")).toBeUndefined();
    expect(keymap.get("F5")).toBeUndefined();
    expect(keymap.get("Ctrl+1")?.id).toBe("workspace.focus-slot-1");
  });

  it("fixed 액션은 디스패처 키맵에서 빠지고, 유효 키는 항상 기본값이다", () => {
    expect(resolveKeymap({}, "win32").get("Ctrl+V")).toBeUndefined();
    expect(effectiveAccelerator("edit.paste", { "edit.paste": "Ctrl+B" }, "win32")).toBe("Ctrl+V");
  });

  it("충돌을 오버라이드 기준으로 찾는다 — fixed 키와의 충돌도 보고한다", () => {
    expect(findConflict("Ctrl+P", {}, "session.refresh", "win32")?.id).toBe("view.quick-open");
    expect(findConflict("Ctrl+P", { "view.quick-open": "Ctrl+K" }, "session.refresh", "win32")).toBeNull();
    expect(findConflict("Ctrl+V", {}, "view.quick-open", "win32")).toMatchObject({ id: "edit.paste", fixed: true });
  });
});

describe("isBindableAccelerator", () => {
  it("단독 문자·숫자·Shift+문자는 거부, 기능키 단독과 Ctrl/Alt 조합은 허용", () => {
    expect(isBindableAccelerator("A", "win32")).toBe(false);
    expect(isBindableAccelerator("1", "win32")).toBe(false);
    expect(isBindableAccelerator("Shift+A", "win32")).toBe(false);
    expect(isBindableAccelerator("F5", "win32")).toBe(true);
    expect(isBindableAccelerator("F12", "win32")).toBe(true);
    expect(isBindableAccelerator("Ctrl+K", "win32")).toBe(true);
    expect(isBindableAccelerator("Alt+1", "win32")).toBe(true);
    expect(isBindableAccelerator("Ctrl+Shift+Tab", "win32")).toBe(true);
  });
});

describe("isTypingTarget", () => {
  it("텍스트 입력 포커스와 모달을 감지한다", () => {
    expect(isTypingTarget()).toBe(false);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    expect(isTypingTarget()).toBe(true);
    input.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    document.body.appendChild(backdrop);
    expect(isTypingTarget()).toBe(true);
    backdrop.remove();
  });

  it("터미널이 키보드를 받는 xterm 숨은 textarea는 입력 필드로 보지 않는다", () => {
    const helper = document.createElement("textarea");
    helper.className = "xterm-helper-textarea";
    document.body.appendChild(helper);
    helper.focus();
    expect(isTypingTarget()).toBe(false);
    helper.remove();

    const field = document.createElement("textarea");
    document.body.appendChild(field);
    field.focus();
    expect(isTypingTarget()).toBe(true);
    field.remove();
  });
});

describe("darwin keymap", () => {
  const event = (overrides: Partial<KeyboardEvent>) =>
    ({ key: "p", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...overrides }) as KeyboardEvent;

  it("Cmd가 Cmd 토큰으로, Ctrl은 Ctrl 토큰으로 구분된다", () => {
    expect(normalizeKeyEvent(event({ metaKey: true }), "darwin")).toBe("Cmd+P");
    expect(normalizeKeyEvent(event({ ctrlKey: true }), "darwin")).toBe("Ctrl+P");
    expect(normalizeKeyEvent(event({ ctrlKey: true, metaKey: true, key: "f" }), "darwin")).toBe("Ctrl+Cmd+F");
  });

  it("win32에서는 meta도 Ctrl로 합쳐진다 (현행 유지)", () => {
    expect(normalizeKeyEvent(event({ metaKey: true }), "win32")).toBe("Ctrl+P");
    expect(normalizeKeyEvent(event({ ctrlKey: true }), "win32")).toBe("Ctrl+P");
  });

  it("darwin 기본값: Ctrl 계열은 Cmd로, 예외 맵은 그대로", () => {
    const by = (id: string) => KEYMAP_ACTIONS.find((action) => action.id === id)!;
    expect(defaultAcceleratorFor(by("view.quick-open"), "darwin")).toBe("Cmd+P");
    expect(defaultAcceleratorFor(by("workspace.focus-slot-1"), "darwin")).toBe("Cmd+1");
    expect(defaultAcceleratorFor(by("view.full-screen"), "darwin")).toBe("Ctrl+Cmd+F");
    expect(defaultAcceleratorFor(by("view.dev-tools"), "darwin")).toBe("Cmd+Alt+I");
    expect(defaultAcceleratorFor(by("session.next"), "darwin")).toBe("Ctrl+Tab");
    expect(defaultAcceleratorFor(by("edit.copy"), "darwin")).toBe("Cmd+C");
    expect(defaultAcceleratorFor(by("view.quick-open"), "win32")).toBe("Ctrl+P");
  });

  it("resolveKeymap이 darwin 기본값으로 매핑된다", () => {
    const keymap = resolveKeymap({}, "darwin");
    expect(keymap.get("Cmd+P")?.id).toBe("view.quick-open");
    expect(keymap.get("Ctrl+P")).toBeUndefined();
  });

  it("darwin에서 Cmd 단독도 리바인딩 가능한 수식키다", () => {
    expect(isBindableAccelerator("Cmd+K", "darwin")).toBe(true);
    expect(isBindableAccelerator("Cmd+Shift+U", "darwin")).toBe(true);
    expect(isBindableAccelerator("Cmd+K", "win32")).toBe(false); // win32에서는 Cmd 토큰이 나오지 않는다
    expect(isBindableAccelerator("Shift+A", "darwin")).toBe(false); // Shift만으로는 여전히 부족
  });
});
