/**
 * The single source of truth for keyboard shortcuts. Action ids are the cases of App.tsx's
 * handleMenuAction switch — this catalog is an index over that switch, not a new execution path.
 * The menu bar derives its shortcut labels from here, so a remap changes the label with it.
 */

export type KeymapCategory = "일반" | "보기" | "세션" | "편집";

export const KEYMAP_CATEGORY_ORDER: readonly KeymapCategory[] = ["일반", "보기", "세션", "편집"];

export interface KeymapAction {
  id: string;
  label: string;
  category: KeymapCategory;
  defaultAccelerator: string | null;
  /** 터미널이 키보드를 쥐고 있어도 디스패처가 가로챈다(캡처 단계). */
  terminalSafe: boolean;
  /** 모달·텍스트 입력이 포커스를 쥔 동안은 무시한다 — 슬롯 포커스·세션 순환류. */
  ignoreWhileTyping: boolean;
  /** 리매핑 불가 — 표시만 된다. edit.*는 TerminalPane의 터미널 의미론과 결합되어 있다. */
  fixed: boolean;
}

const action = (
  id: string,
  label: string,
  category: KeymapCategory,
  defaultAccelerator: string | null,
  options?: Partial<Pick<KeymapAction, "terminalSafe" | "ignoreWhileTyping" | "fixed">>,
): KeymapAction => ({
  id,
  label,
  category,
  defaultAccelerator,
  terminalSafe: options?.terminalSafe ?? true,
  ignoreWhileTyping: options?.ignoreWhileTyping ?? false,
  fixed: options?.fixed ?? false,
});

export const KEYMAP_ACTIONS: readonly KeymapAction[] = [
  action("view.quick-open", "빠른 열기", "일반", "Ctrl+P"),
  action("file.save", "파일 저장", "일반", "Ctrl+S"),
  action("file.refresh", "파일 목록 새로고침", "보기", "F5"),
  action("settings.open", "설정 열기", "일반", "Ctrl+,"),
  action("view.zoom-in", "확대", "보기", "Ctrl+="),
  action("view.zoom-out", "축소", "보기", "Ctrl+-"),
  action("view.zoom-reset", "원래 크기", "보기", "Ctrl+0"),
  action("view.full-screen", "전체 화면", "보기", "F11"),
  action("view.dev-tools", "개발자 도구", "보기", "F12"),
  // Ctrl+R 기본값은 의도적으로 없다 — 오타 한 번의 리로드가 세션 화면을 날린다.
  action("view.reload", "다시 로드", "보기", null),
  action("view.zoom-pane", "패인 확대/해제", "보기", "Ctrl+Shift+Enter", { ignoreWhileTyping: true }),
  action("session.refresh", "세션 새로고침", "세션", null),
  action("session.next", "다음 세션", "세션", "Ctrl+Tab", { ignoreWhileTyping: true }),
  action("session.prev", "이전 세션", "세션", "Ctrl+Shift+Tab", { ignoreWhileTyping: true }),
  action("session.next-waiting", "다음 대기 세션", "세션", "Ctrl+Shift+U", { ignoreWhileTyping: true }),
  ...Array.from({ length: 9 }, (_, index) =>
    action(`workspace.focus-slot-${index + 1}`, `슬롯 ${index + 1} 포커스`, "세션", `Ctrl+${index + 1}`, {
      ignoreWhileTyping: true,
    }),
  ),
  action("workspace.focus-left", "왼쪽 패인으로", "세션", "Ctrl+Alt+ArrowLeft", { ignoreWhileTyping: true }),
  action("workspace.focus-right", "오른쪽 패인으로", "세션", "Ctrl+Alt+ArrowRight", { ignoreWhileTyping: true }),
  action("workspace.focus-up", "위 패인으로", "세션", "Ctrl+Alt+ArrowUp", { ignoreWhileTyping: true }),
  action("workspace.focus-down", "아래 패인으로", "세션", "Ctrl+Alt+ArrowDown", { ignoreWhileTyping: true }),
  action("workspace.page-prev", "이전 페이지", "세션", "Ctrl+PageUp", { ignoreWhileTyping: true }),
  action("workspace.page-next", "다음 페이지", "세션", "Ctrl+PageDown", { ignoreWhileTyping: true }),
  action("edit.copy", "복사", "편집", "Ctrl+Shift+C", { fixed: true }),
  action("edit.paste", "붙여넣기", "편집", "Ctrl+V", { fixed: true }),
  action("edit.select-all", "모두 선택", "편집", "Ctrl+A", { fixed: true }),
  action("edit.find", "터미널에서 찾기", "편집", "Ctrl+F", { fixed: true }),
  action("edit.clear", "터미널 지우기", "편집", null, { fixed: true }),
];

/** Shift로 타이핑되는 글리프 — 표기는 기본 키로 하고 Shift는 표기에서 뺀다(현행 줌 키 동작과 일치). */
const SHIFT_GLYPHS: Record<string, string> = { "+": "=", _: "-" };

export function normalizeKeyEvent(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  platform: NodeJS.Platform,
): string | null {
  const key = event.key;
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") return null;
  const glyph = SHIFT_GLYPHS[key];
  let normalized = glyph ?? (key === " " ? "Space" : key);
  if (normalized.length === 1) normalized = normalized.toUpperCase();
  const parts: string[] = [];
  if (platform === "darwin") {
    // Cmd가 앱 단축키의 수식키다. 실제 Ctrl 조합은 별도 토큰이라 기본 키맵과 충돌하지 않고
    // 터미널(readline)로 흘러간다.
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.metaKey) parts.push("Cmd");
  } else if (event.ctrlKey || event.metaKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && glyph === undefined) parts.push("Shift");
  parts.push(normalized);
  return parts.join("+");
}

/** darwin 기본값 중 Ctrl→Cmd 일괄 치환을 따르지 않는 것들. 값의 수식키 순서는 normalizeKeyEvent와 같다. */
const DARWIN_DEFAULT_OVERRIDES: Record<string, string | null> = {
  "view.full-screen": "Ctrl+Cmd+F", // macOS 전체 화면 관례
  "view.dev-tools": "Cmd+Alt+I",
  "session.next": "Ctrl+Tab", // Cmd+Tab은 OS 앱 전환이라 실제 Ctrl을 유지한다
  "session.prev": "Ctrl+Shift+Tab",
  "workspace.page-prev": "Ctrl+PageUp", // MacBook에서는 Ctrl+Fn+↑
  "workspace.page-next": "Ctrl+PageDown",
  "edit.copy": "Cmd+C",
  "edit.paste": "Cmd+V",
  "edit.select-all": "Cmd+A",
  "edit.find": "Cmd+F",
};

export function defaultAcceleratorFor(action: KeymapAction, platform: NodeJS.Platform): string | null {
  if (platform !== "darwin") return action.defaultAccelerator;
  const override = DARWIN_DEFAULT_OVERRIDES[action.id];
  if (override !== undefined) return override;
  return action.defaultAccelerator === null ? null : action.defaultAccelerator.replace(/\bCtrl\b/g, "Cmd");
}

export function effectiveAccelerator(
  actionId: string,
  overrides: Record<string, string | null>,
  platform: NodeJS.Platform,
): string | null {
  const found = KEYMAP_ACTIONS.find((candidate) => candidate.id === actionId);
  if (!found) return null;
  if (found.fixed) return defaultAcceleratorFor(found, platform);
  const override = overrides[actionId];
  return override === undefined ? defaultAcceleratorFor(found, platform) : override;
}

export function resolveKeymap(overrides: Record<string, string | null>, platform: NodeJS.Platform): Map<string, KeymapAction> {
  const keymap = new Map<string, KeymapAction>();
  for (const candidate of KEYMAP_ACTIONS) {
    if (candidate.fixed) continue; // edit.*는 TerminalPane 소유 — 디스패처가 잡으면 반쪽 리매핑이 된다
    const accelerator = effectiveAccelerator(candidate.id, overrides, platform);
    if (accelerator) keymap.set(accelerator, candidate);
  }
  return keymap;
}

export function findConflict(
  accelerator: string,
  overrides: Record<string, string | null>,
  excludeActionId: string,
  platform: NodeJS.Platform,
): KeymapAction | null {
  for (const candidate of KEYMAP_ACTIONS) {
    if (candidate.id === excludeActionId) continue;
    if (effectiveAccelerator(candidate.id, overrides, platform) === accelerator) return candidate;
  }
  return null;
}

export function isBindableAccelerator(accelerator: string, platform: NodeJS.Platform): boolean {
  const parts = accelerator.split("+");
  const key = parts[parts.length - 1] ?? "";
  const modifiers = new Set(parts.slice(0, -1));
  if (/^F([1-9]|1[0-2])$/.test(key)) return true;
  // Shift만으로는 부족하다 — Shift+문자는 곧 대문자 타이핑이다. Ctrl이나 Alt가 있어야 한다.
  // darwin은 Cmd가 앱 단축키의 수식키다.
  if (platform === "darwin" && modifiers.has("Cmd")) return true;
  return modifiers.has("Ctrl") || modifiers.has("Alt");
}

/**
 * 슬롯 포커스류가 삼켜야 할 상황인지: 모달이 떠 있거나 텍스트 입력이 포커스를 쥐고 있다. 터미널은
 * xterm의 숨은 textarea로 키를 받지만 입력 필드가 아니다 — 세션 순환·슬롯 포커스는 거기서 동작해야 한다.
 */
export function isTypingTarget(): boolean {
  if (document.querySelector(".modal-backdrop")) return true;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (active.classList.contains("xterm-helper-textarea")) return false;
  if (active.isContentEditable) return true;
  return active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT";
}
