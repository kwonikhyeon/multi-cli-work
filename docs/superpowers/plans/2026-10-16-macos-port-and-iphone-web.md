# macOS 포팅 + iPhone 웹 컴패니언 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** macOS(Apple Silicon)를 3번째 데스크톱 플랫폼으로 추가하고, iPhone Safari(홈 화면)에서 기존 모바일 웹 UI를 쓸 수 있게 다듬는다.

**Architecture:** 기존 Electron 앱의 `win32` vs 나머지(POSIX=Linux 가정) 이분법에 darwin 분기를 명시적으로 추가한다. 비Windows 경로 대부분은 POSIX라 macOS에서 그대로 통하므로, 창 크롬·셸·단축키·업데이터·트레이/독만 손댄다. iPhone은 호스트가 서빙하는 `/mobile/` 웹 UI를 그대로 쓰고 메타·safe-area·안내만 더한다.

**Tech Stack:** Electron 43 · React 18 · TypeScript 5.7 · electron-vite · vitest(+@testing-library/react, jsdom) · Playwright · electron-builder

**스펙:** `docs/superpowers/specs/2026-10-16-macos-ios-expansion-design.md`

## Global Constraints

- Node >= 22.12, Electron 43.2.0, 작업 브랜치 `feat/macos-ios-expansion`.
- **테스트·실행은 Node 22 LTS로**(`nvm use 22`) — 시스템 Node v25.6은 vitest jsdom과 `globalThis.localStorage` 충돌로 171개 테스트가 실패한다(Task 1 보고서). `npm ci` 뒤 Electron 바이너리가 없으면(`Error: Electron uninstall`) `node node_modules/electron/install.js`를 한 번 실행한다.
- macOS는 **arm64 전용**, 서명은 **ad-hoc**(`identity: null`), **자동 업데이트는 darwin에서 비활성**(수동 안내로 대체).
- **Windows/Linux 동작 불변.** 기본값만 플랫폼화하고, 저장된 사용자 keybindings·설정 스키마는 건드리지 않는다.
- 신규 darwin 분기마다 **유닛 테스트 동반**. 테스트 파일은 대상 파일 옆에 둔다(기존 관례).
- 각 태스크 끝에 커밋. 커밋 제목은 영어 conventional commit(`feat:`/`fix:`/`test:`/`chore:`), 본문 없이 짧게 — 기존 로그 스타일.
- UI 문자열·코드 주석은 기존 파일의 한국어 스타일을 따른다.
- 범위 밖(YAGNI): Developer ID 서명·공증, macOS 자동 업데이트 on, CI macOS 러너, iOS 네이티브 셸, Intel/universal.
- 전체 테스트 실행 명령: `npm test` (vitest run), 타입 검사: `npm run typecheck`.

---

## Phase 0 — 개발환경

### Task 1: macOS 개발환경 검증 (코드 변경 없음)

**Files:** 없음 (환경만)

- [x] **Step 1: Xcode Command Line Tools 확인/설치**

Run: `xcode-select -p`
Expected: `/Library/Developer/CommandLineTools` 또는 Xcode 경로 출력. 에러가 나면 `xcode-select --install` 실행 후 설치 완료까지 대기하고 다시 확인.

- [x] **Step 2: 의존성 설치 + 네이티브 모듈 빌드**

Run: `npm ci`
Expected: 종료 코드 0. postinstall의 `electron-builder install-app-deps`가 node-pty를 Electron 43 ABI로 빌드한다.
실패 시: `npm run rebuild:native` 실행 후 재확인. 그래도 실패하면 `nvm use 22`(Node 22 LTS)로 전환 후 `npm ci` 재시도.

- [x] **Step 3: 타입 검사와 유닛 테스트**

Run: `npm run typecheck && npm test`
Expected: 모두 통과. (다른 OS 전용 테스트는 platform 인자를 받는 순수 함수 테스트라 macOS에서도 돈다.)

- [x] **Step 4: dev 모드 첫 기동 수동 확인**

Run: `npm run dev`
확인: ① 앱 창이 뜬다 ② 폴더를 하나 열고 Bash 세션을 시작한다(아직 zsh 없음 — Task 4 전) ③ `echo hello` 입력·출력 확인 ④ 창을 닫아 종료. 터미널이 안 열리면 Step 2 실패 상태다.

- [x] **Step 5: 결과 기록**

이 플랜 파일의 위 체크박스를 채우고 커밋: `git add -A && git commit -m "chore: verify macOS dev environment"`

---

## Phase 1 — macOS 필수 분기

### Task 2: 창 크롬 — darwin은 hiddenInset

**Files:**
- Modify: `src/main/window-chrome.ts`
- Test: `src/main/window-chrome.test.ts`

**Interfaces:**
- Produces: `windowChromeOptions("darwin")` → `{ titleBarStyle: "hiddenInset" }` (Task 3의 TitleBar 인셋이 이 결정에 기댄다)

- [ ] **Step 1: 실패하는 테스트로 바꾸기**

`src/main/window-chrome.test.ts`의 둘째 it 블록을 분리해 darwin 기대값을 바꾼다:

```ts
  it("drops the frame on Linux, because titleBarStyle is a no-op there", () => {
    expect(windowChromeOptions("linux")).toEqual({ frame: false });
  });

  it("keeps the traffic lights on macOS by hiding only the title bar", () => {
    expect(windowChromeOptions("darwin")).toEqual({ titleBarStyle: "hiddenInset" });
  });
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/main/window-chrome.test.ts`
Expected: FAIL — darwin이 `{ frame: false }`를 돌려준다.

- [ ] **Step 3: 구현**

`src/main/window-chrome.ts` 전체를 다음으로 교체(파일 머리 주석의 "macOS is not a packaging target" 문단 삭제):

```ts
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/main/window-chrome.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/window-chrome.ts src/main/window-chrome.test.ts
git commit -m "feat: keep macOS traffic lights with hiddenInset chrome"
```

### Task 3: TitleBar — darwin 신호등 인셋 + 창 버튼 숨김

**Files:**
- Modify: `src/renderer/src/TitleBar.tsx` (창 버튼 블록, 루트 클래스)
- Modify: `src/renderer/src/index.css` (`.title-bar` 부근, 311행 근처)
- Test: `src/renderer/src/TitleBar.test.tsx`

**Interfaces:**
- Consumes: `window.multiCliWork.platform: NodeJS.Platform` (preload `src/preload/index.ts:15`에 이미 존재)

- [ ] **Step 1: 실패하는 테스트 추가**

`TitleBar.test.tsx`에 darwin 케이스를 추가한다. 이 파일은 이미 `window.multiCliWork`를 스텁하고 TitleBar를 렌더한다 — 같은 스텁 헬퍼를 쓰되 `platform`만 바꾼다(스텁 객체에 `platform` 필드가 없으면 추가; 기존 테스트는 `platform: "win32"`로 둔다):

```tsx
it("darwin에서는 OS 신호등이 있으므로 창 버튼을 그리지 않는다", () => {
  (window.multiCliWork as { platform: NodeJS.Platform }).platform = "darwin";
  render(<TitleBar {...baseProps} />); // baseProps: 파일의 기존 기본 프롭 헬퍼 사용
  expect(screen.queryByLabelText("최소화")).toBeNull();
  expect(screen.queryByLabelText("닫기")).toBeNull();
  expect(document.querySelector(".title-bar")?.className).toContain("title-bar-mac");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/renderer/src/TitleBar.test.tsx`
Expected: FAIL — 버튼이 렌더되고 클래스가 없다.

- [ ] **Step 3: 구현**

`TitleBar.tsx`의 `TitleBar` 함수 본문 상단에:

```tsx
const isMac = window.multiCliWork.platform === "darwin";
```

루트를 `<div className={isMac ? "title-bar title-bar-mac" : "title-bar"}>`로 바꾸고, 파일 끝의 `<div className="window-controls">…</div>` 블록 전체를 다음으로 감싼다:

```tsx
{isMac ? null : (
  <div className="window-controls">
    …기존 세 버튼 그대로…
  </div>
)}
```

`index.css`의 `.title-bar` 규칙(311행 근처) 아래에 추가:

```css
/* macOS: hiddenInset 신호등(좌측 약 70px)을 피해 메뉴를 민다. 창 버튼은 OS 것을 쓴다. */
.title-bar-mac { padding-left: 76px; }
```

- [ ] **Step 4: 통과 확인 + 수동 확인**

Run: `npx vitest run src/renderer/src/TitleBar.test.tsx`
Expected: PASS
Run: `npm run dev` — 신호등 3개가 보이고 커스텀 메뉴와 겹치지 않는다. 타이틀바 빈 영역 드래그로 창이 움직인다(`-webkit-app-region: drag`는 기존 CSS).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/TitleBar.tsx src/renderer/src/TitleBar.test.tsx src/renderer/src/index.css
git commit -m "feat: inset title bar around macOS traffic lights"
```

### Task 4: 내장 zsh 에이전트 — darwin 기본 셸

**Files:**
- Modify: `src/shared/agent-types.ts:10` (`BUILTIN_AGENT_IDS`)
- Modify: `src/main/agents/builtin-agents.ts` (zsh 정의 + `builtinAgents()` darwin 분기)
- Test: `src/main/agents/agent-registry.test.ts`

**Interfaces:**
- Produces: `builtinAgents("darwin")` → `[zsh, bash, claude, codex]` 순서의 `AgentDefinition[]`. zsh는 `id: "zsh"`, `commands: ["zsh"]`, `args: ["--login"]`.

- [ ] **Step 1: 실패하는 테스트 추가**

`agent-registry.test.ts`의 기존 win32 테스트(42행 근처 `readAgentRegistry({ registryPath, platform: "win32" })` 패턴)를 본떠 darwin 케이스를 추가한다. 단언 형태는 바로 위 win32 테스트가 agents 목록을 읽는 방식을 그대로 따른다:

```ts
it("darwin exposes zsh as the OS shell, with bash beside it", async () => {
  const snapshot = await readAgentRegistry({ registryPath: await tempRegistryPath(), platform: "darwin" });
  expect(snapshot.agents.map((agent) => agent.id)).toEqual(["zsh", "bash", "claude", "codex"]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/main/agents/agent-registry.test.ts`
Expected: FAIL — zsh가 없다. (`BUILTIN_AGENT_IDS`에 zsh를 넣기 전까지는 타입 에러로 먼저 멈출 수 있다 — 그 경우도 "실패"로 간주하고 진행.)

- [ ] **Step 3: 구현**

`src/shared/agent-types.ts:10`:

```ts
export const BUILTIN_AGENT_IDS = ["powershell", "bash", "zsh", "claude", "codex"] as const;
```

`builtin-agents.ts`의 `BUILTIN_AGENTS`에 bash 항목 바로 아래 추가(Record가 zsh 키를 강제한다):

```ts
  zsh: {
    id: "zsh",
    label: "zsh",
    commands: ["zsh"],
    args: ["--login"],
    newSessionArgs: [],
    resumeArgs: [],
    conversationId: "none",
    statusAdapter: "signals",
    titleSource: "none",
    shiftEnter: "enter",
    icon: null,
    accentColor: "#4eaa25",
    builtin: true,
  },
```

같은 파일 끝 `builtinAgents()`를 교체:

```ts
export function builtinAgents(platform: NodeJS.Platform = process.platform): AgentDefinition[] {
  // macOS의 기본 로그인 셸은 zsh다. bash(3.2)도 있으므로 함께 노출한다.
  if (platform === "darwin") {
    return [BUILTIN_AGENTS.zsh, BUILTIN_AGENTS.bash, BUILTIN_AGENTS.claude, BUILTIN_AGENTS.codex];
  }
  const shellId: BuiltinAgentId = platform === "win32" ? "powershell" : "bash";
  return [BUILTIN_AGENTS[shellId], BUILTIN_AGENTS.claude, BUILTIN_AGENTS.codex];
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run typecheck && npx vitest run src/main/agents`
Expected: PASS (agents 폴더의 다른 테스트도 함께 돈다 — zsh 추가로 깨지는 pin이 있으면 그 테스트에 zsh 케이스를 같은 형식으로 추가)

- [ ] **Step 5: 수동 확인 + Commit**

Run: `npm run dev` — 런처에 zsh가 보이고 세션이 열린다. `echo $SHELL` 확인.

```bash
git add src/shared/agent-types.ts src/main/agents/builtin-agents.ts src/main/agents/agent-registry.test.ts
git commit -m "feat: add zsh builtin agent as the macOS shell"
```

### Task 5: keymap 플랫폼화 — darwin에서 Cmd와 Ctrl을 구분

**Files:**
- Modify: `src/renderer/src/keymap.ts`
- Modify: `src/renderer/src/app/use-app-shortcuts.ts`
- Modify: `src/renderer/src/title-bar-menu.ts` (`buildTitleBarMenus` 시그니처)
- Modify: `src/renderer/src/SettingsDialog.tsx` (868·889·895·923·1301행 근처의 keymap 호출)
- Modify: `src/renderer/src/App.tsx` (`buildTitleBarMenus` 호출부)
- Test: `src/renderer/src/keymap.test.ts`

**Interfaces:**
- Produces (후속 태스크가 쓰는 정확한 시그니처):
  - `normalizeKeyEvent(event, platform: NodeJS.Platform): string | null` — darwin: `ctrlKey→"Ctrl"`, `metaKey→"Cmd"`; 그 외 플랫폼: `(ctrlKey||metaKey)→"Ctrl"` (현행 유지). 수식키 순서 `Ctrl, Cmd, Alt, Shift`.
  - `defaultAcceleratorFor(action: KeymapAction, platform: NodeJS.Platform): string | null`
  - `effectiveAccelerator(actionId: string, overrides: Record<string, string | null>, platform: NodeJS.Platform): string | null`
  - `resolveKeymap(overrides: Record<string, string | null>, platform: NodeJS.Platform): Map<string, KeymapAction>`
  - `findConflict(accelerator: string, overrides: Record<string, string | null>, excludeActionId: string, platform: NodeJS.Platform): KeymapAction | null`
  - `isBindableAccelerator(accelerator: string, platform: NodeJS.Platform): boolean` — darwin에서는 `Cmd`도 충분한 수식키로 인정한다.
- 설계 결정: 저장 포맷은 그대로(토큰 문자열). darwin 기본값은 `Ctrl→Cmd` 일괄 치환 + 아래 예외 맵. **실제 Ctrl 조합은 darwin에서 터미널로 흘러간다**(readline 보호).

- [ ] **Step 1: 실패하는 테스트 추가**

`keymap.test.ts`에 추가(기존 테스트의 import에 `defaultAcceleratorFor` 포함시키고, 기존 호출부는 Step 3에서 플랫폼 인자를 받도록 함께 고친다 — 기존 단언은 `"win32"`를 넘겨 그대로 유지):

```ts
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/renderer/src/keymap.test.ts`
Expected: FAIL (시그니처 불일치 타입 에러 포함)

- [ ] **Step 3: keymap.ts 구현**

`normalizeKeyEvent`에 `platform: NodeJS.Platform` 둘째 인자를 추가하고 수식키 블록을 교체:

```ts
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
```

예외 맵과 `defaultAcceleratorFor`를 `KEYMAP_ACTIONS` 아래에 추가:

```ts
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
```

`effectiveAccelerator`·`resolveKeymap`·`findConflict`에 `platform` 매개변수를 추가하고, 내부의 `found.defaultAccelerator`/`candidate` 기본값 읽기를 전부 `defaultAcceleratorFor(found, platform)` 호출로 바꾼다. (fixed 액션도 `defaultAcceleratorFor`를 거친다 — darwin에서 `Cmd+C` 라벨이 나오게.)

`isBindableAccelerator`도 플랫폼을 받아야 한다. 지금은 `Ctrl`·`Alt`만 유효 수식키로 인정하므로, darwin에서 사용자가 `Cmd+K`를 누르면 `normalizeKeyEvent`가 `"Cmd+K"`를 내고 이 함수가 거부해 **Cmd 조합 리바인딩이 전부 막힌다**(인자가 string이라 타입 검사로는 드러나지 않는다):

```ts
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
```

- [ ] **Step 4: 호출부 수정**

- `use-app-shortcuts.ts`: 훅 상단에 `const platform = window.multiCliWork.platform;` 추가, `resolveKeymap(keybindings, platform)`·`normalizeKeyEvent(event, platform)`로 변경.
- `title-bar-menu.ts`: `buildTitleBarMenus(context, keybindings = {}, platform: NodeJS.Platform)`으로 시그니처 확장, `shortcutFor`가 `effectiveAccelerator(actionId, keybindings, platform)`을 쓰게.
- `App.tsx`: `buildTitleBarMenus(...)` 호출부에 `window.multiCliWork.platform` 전달.
- `SettingsDialog.tsx`: 컴포넌트 상단에 `const platform = window.multiCliWork.platform;`를 두고 868행(기본값 표시)·889행/923행(`normalizeKeyEvent(event, platform)`)·891행(`isBindableAccelerator(accelerator, platform)`)·895행(`findConflict(..., platform)`)·1301행 근처 목록 렌더에서 `candidate.defaultAccelerator`를 읽는 자리를 `defaultAcceleratorFor(candidate, platform)`으로 교체.
- `title-bar-menu.test.ts` 등 기존 테스트의 호출부에는 `"win32"`를 넘겨 기대값 불변을 확인한다.

Run: `npm run typecheck`
Expected: PASS — 컴파일러가 빠뜨린 호출부를 전부 짚어준다. 에러가 남아 있으면 그 자리도 같은 방식으로 platform을 넘긴다.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/renderer/src`
Expected: PASS (keymap·title-bar-menu·SettingsDialog·App 테스트 포함)

- [ ] **Step 6: Commit**

```bash
git add -A src/renderer/src
git commit -m "feat: platform-aware keymap with Cmd on macOS"
```

### Task 6: 단축키 라벨 — darwin은 ⌃⌥⇧⌘ 기호 표기

**Files:**
- Modify: `src/renderer/src/keymap.ts` (`acceleratorLabel` 추가)
- Modify: `src/renderer/src/title-bar-menu.ts` (`shortcutFor`가 라벨 포매터를 거침)
- Modify: `src/renderer/src/SettingsDialog.tsx` (단축키 탭의 표시 문자열)
- Test: `src/renderer/src/keymap.test.ts`

**Interfaces:**
- Consumes: Task 5의 `effectiveAccelerator(actionId, overrides, platform)`
- Produces: `acceleratorLabel(accelerator: string, platform: NodeJS.Platform): string` — darwin: `"Cmd+Shift+U"` → `"⇧⌘U"`(기호 순서 ⌃⌥⇧⌘, 구분자 없음), 그 외: 입력 그대로.

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
describe("acceleratorLabel", () => {
  it("darwin은 mac 기호 순서(⌃⌥⇧⌘)로 그린다", () => {
    expect(acceleratorLabel("Cmd+P", "darwin")).toBe("⌘P");
    expect(acceleratorLabel("Cmd+Shift+U", "darwin")).toBe("⇧⌘U");
    expect(acceleratorLabel("Ctrl+Cmd+F", "darwin")).toBe("⌃⌘F");
    expect(acceleratorLabel("Cmd+Alt+I", "darwin")).toBe("⌥⌘I");
    expect(acceleratorLabel("F5", "darwin")).toBe("F5");
  });
  it("다른 플랫폼은 그대로 둔다", () => {
    expect(acceleratorLabel("Ctrl+P", "win32")).toBe("Ctrl+P");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/renderer/src/keymap.test.ts`
Expected: FAIL — `acceleratorLabel`이 없다.

- [ ] **Step 3: 구현**

`keymap.ts`에 추가:

```ts
/** 표시 전용. 저장 포맷은 토큰 문자열 그대로이고, darwin에서만 기호로 바꿔 그린다. */
const MAC_SYMBOL_ORDER: ReadonlyArray<[token: string, symbol: string]> = [
  ["Ctrl", "⌃"],
  ["Alt", "⌥"],
  ["Shift", "⇧"],
  ["Cmd", "⌘"],
];

export function acceleratorLabel(accelerator: string, platform: NodeJS.Platform): string {
  if (platform !== "darwin") return accelerator;
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  const symbols = MAC_SYMBOL_ORDER.filter(([token]) => parts.includes(token))
    .map(([, symbol]) => symbol)
    .join("");
  return `${symbols}${key}`;
}
```

`title-bar-menu.ts`의 `shortcutFor`를:

```ts
const shortcutFor = (actionId: string): string | undefined => {
  const accelerator = effectiveAccelerator(actionId, keybindings, platform);
  return accelerator ? acceleratorLabel(accelerator, platform) : undefined;
};
```

`SettingsDialog.tsx`에서 토큰 문자열을 **화면에 그리는 자리는 세 곳**이다. 전부 `acceleratorLabel(<문자열>, platform)`을 거치게 한다. **입력 캡처가 저장하는 값은 그대로** 토큰 문자열이다(라벨만 변환) — `platform`은 Task 5에서 이미 이 컴포넌트 상단에 있다.

① 단축키 목록 행(1316행 근처). `accelerator`는 `effectiveAccelerator(...)`의 반환값이다:

```tsx
                            {capturing ? "키를 누르세요…" : accelerator ? acceleratorLabel(accelerator, platform) : "없음"}
```

② 전역 summon 키 표시(1036행 근처). 저장값이 `Ctrl+Alt+K`여도 darwin에서는 `⌃⌥K`로 보여야 ①과 표기가 어긋나지 않는다:

```tsx
                    {capturingSummon
                      ? "키를 누르세요…"
                      : settings.general.summonShortcut
                        ? acceleratorLabel(settings.general.summonShortcut, platform)
                        : "없음"}
```

③ 충돌 안내(897행 근처)도 토큰을 그대로 노출한다:

```tsx
        setCaptureNotice(`${acceleratorLabel(accelerator, platform)}는 ${existing.label}의 고정 키입니다`);
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/renderer/src && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/keymap.ts src/renderer/src/keymap.test.ts src/renderer/src/title-bar-menu.ts src/renderer/src/SettingsDialog.tsx
git commit -m "feat: render mac symbol shortcut labels"
```

### Task 7: TerminalPane — darwin은 Cmd+F 찾기, Ctrl은 PTY로

**Files:**
- Modify: `src/renderer/src/TerminalPane.tsx:198-241` (attachCustomKeyEventHandler)
- Test: `src/renderer/src/TerminalPane.test.tsx`

**Interfaces:**
- Consumes: `window.multiCliWork.platform`
- 동작 계약: darwin에서 ① `Cmd+F`가 찾기 막대를 연다 ② `Ctrl+F`·`Ctrl+C`·`Ctrl+V`는 가로채지 않고 PTY로 간다 ③ 복사/붙여넣기는 브라우저 네이티브 `Cmd+C/V`(xterm이 copy/paste 이벤트 처리)에 맡긴다. 다른 플랫폼은 현행 그대로.

- [ ] **Step 1: 실패하는 테스트 추가**

`TerminalPane.test.tsx`의 기존 키 이벤트 테스트(ctrlKey를 쓰는 블록)를 본떠 darwin 케이스를 추가한다. 플랫폼 스텁은 Task 3과 같은 방식:

```tsx
it("darwin에서는 Cmd+F가 찾기를 열고 Ctrl+F는 터미널로 흘러간다", () => {
  (window.multiCliWork as { platform: NodeJS.Platform }).platform = "darwin";
  // 기존 테스트와 같은 렌더·핸들러 취득 헬퍼 사용
  expect(handler({ type: "keydown", code: "KeyF", key: "f", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false })).toBe(false); // 가로챔
  expect(handler({ type: "keydown", code: "KeyF", key: "f", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false })).toBe(true); // PTY로
  expect(handler({ type: "keydown", code: "KeyC", key: "c", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false })).toBe(true); // SIGINT 보존
});
```

(`handler`는 이 테스트 파일이 `attachCustomKeyEventHandler`에 넘겨진 콜백을 캡처하는 기존 방식을 그대로 쓴다.)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/renderer/src/TerminalPane.test.tsx`
Expected: FAIL — Cmd+F가 가로채지지 않거나 Ctrl+F가 가로채진다.

- [ ] **Step 3: 구현**

`attachCustomKeyEventHandler` 콜백 상단에 `const isMac = window.multiCliWork.platform === "darwin";`를 두고:

① 찾기 분기 조건을 플랫폼별로:

```ts
      const findModifier = isMac
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
      if (
        (event.code === "KeyF" || event.key === "f" || event.key === "F") &&
        findModifier &&
        !event.shiftKey &&
        !event.altKey
      ) {
```

② Shift+Enter 분기는 그대로 둔다.

③ Ctrl+C/V 복사·붙여넣기 블록 진입 직전에:

```ts
      // macOS 복사/붙여넣기는 Cmd+C/V — 브라우저 copy/paste 이벤트로 xterm이 처리한다.
      // Ctrl+C(인터럽트)·Ctrl+V(quoted-insert)는 그대로 PTY에 준다.
      if (isMac) return true;
      if (!event.ctrlKey || event.altKey) return true;
```

- [ ] **Step 4: 통과 확인 + 수동 확인**

Run: `npx vitest run src/renderer/src/TerminalPane.test.tsx`
Expected: PASS
Run: `npm run dev` — zsh 세션에서 ① 텍스트 선택 후 `Cmd+C` → 다른 곳에 붙여넣기 확인 ② `Cmd+V` 붙여넣기 확인 ③ 긴 명령 중 `Ctrl+C` 인터럽트 확인 ④ `Cmd+F` 찾기 막대 확인. (Cmd+C/V 네이티브 동작은 Task 9의 editMenu role이 있어야 완전해진다 — 이 수동 확인은 Task 9 뒤에 재검한다.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/TerminalPane.tsx src/renderer/src/TerminalPane.test.tsx
git commit -m "feat: mac-native terminal find and clipboard keys"
```

### Task 8: 업데이터 — darwin 수동 모드

**Files:**
- Modify: `src/shared/api-types.ts:293` (`UpdaterStatus` union)
- Modify: `src/main/updater-platform.ts` (+`updaterSupported`)
- Modify: `src/main/updater.ts` (`initUpdater`·`checkForUpdates` darwin 분기)
- Modify: `src/renderer/src/session-labels.ts:63` (`updaterStatusLabel`)
- Modify: `src/renderer/src/UpdateBadge.tsx`
- Test: `src/main/updater-platform.test.ts`(없으면 생성), `src/renderer/src/UpdateBadge.test.tsx`

**Interfaces:**
- Produces: `UpdaterStatus`에 `{ state: "manual" }` 추가. `updaterSupported(platform: NodeJS.Platform): boolean` — darwin만 false.
- 동작 계약: darwin에서는 electron-updater를 전혀 건드리지 않고 상태가 `manual`로 고정된다. 배지는 `릴리스` 링크를 보여주고, 트레이의 "업데이트 확인"(`checkForUpdates`)은 릴리스 페이지를 연다.

- [ ] **Step 1: 실패하는 테스트 추가**

`src/main/updater-platform.test.ts`(기존 파일이 있으면 describe 추가, 없으면 `window-chrome.test.ts`처럼 `// @vitest-environment node`로 생성):

```ts
import { describe, expect, it } from "vitest";
import { updaterSupported } from "./updater-platform";

describe("updaterSupported", () => {
  it("서명 없는 macOS 빌드는 자동 업데이트가 없다", () => {
    expect(updaterSupported("darwin")).toBe(false);
    expect(updaterSupported("win32")).toBe(true);
    expect(updaterSupported("linux")).toBe(true);
  });
});
```

`UpdateBadge.test.tsx`에 manual 상태 렌더 케이스 추가(기존 스텁 헬퍼 사용, `updates.status()`가 `{ state: "manual" }`을 돌려주게):

```tsx
it("manual 상태에서는 릴리스 링크 버튼을 보여준다", async () => {
  // 기존 테스트의 window.multiCliWork.updates 스텁에서 status: async () => ({ state: "manual" })
  render(<UpdateBadge />);
  expect(await screen.findByRole("button", { name: "릴리스" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/main/updater-platform.test.ts src/renderer/src/UpdateBadge.test.tsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`api-types.ts` union에 `| { state: "manual" }` 추가.

`updater-platform.ts`에 추가:

```ts
/** electron-updater는 서명된 macOS 빌드에서만 동작한다. 개인용(ad-hoc) 단계에서는 수동 안내로 대체한다. */
export function updaterSupported(platform: NodeJS.Platform): boolean {
  return platform !== "darwin";
}
```

`updater.ts`:

```ts
import { configureAutoUpdater, quitAndInstallArguments, updaterSupported } from "./updater-platform";
```

`initUpdater` 본문 맨 앞(getWindow 대입 직후)에:

```ts
  if (!updaterSupported(process.platform)) {
    publish({ state: "manual" });
    return;
  }
```

`checkForUpdates` 맨 앞에:

```ts
  if (!updaterSupported(process.platform)) {
    publish({ state: "manual" });
    await shell.openExternal(RELEASES_URL);
    return;
  }
```

`session-labels.ts` `updaterStatusLabel` switch에 `case "manual": return "수동 업데이트";` 추가.

`UpdateBadge.tsx` 분기 교체:

```tsx
      {status.state === "error" || status.state === "manual" ? (
        <button type="button" onClick={() => void window.multiCliWork.updates.openReleases()}>
          릴리스
        </button>
      ) : (
```

- [ ] **Step 4: 통과 확인**

Run: `npm run typecheck && npx vitest run src/main/updater-platform.test.ts src/renderer/src/UpdateBadge.test.tsx src/renderer/src/session-labels.test.ts`
Expected: PASS (session-labels 테스트가 상태 전수 검사라면 manual 케이스를 거기에도 추가)

- [ ] **Step 5: Commit**

```bash
git add src/shared/api-types.ts src/main/updater-platform.ts src/main/updater-platform.test.ts src/main/updater.ts src/renderer/src/session-labels.ts src/renderer/src/UpdateBadge.tsx src/renderer/src/UpdateBadge.test.tsx
git commit -m "feat: manual update mode on unsigned macOS builds"
```

### Task 9: macOS 앱 통합 — 애플리케이션 메뉴·activate·Dock 배지

**Files:**
- Modify: `src/main/index.ts` (`Menu.setApplicationMenu(null)` 자리, `applyAttentionSnapshot`, whenReady 체인)
- Modify: `src/main/window-badge.ts` (+`dockBadgeText`)
- Test: `src/main/window-badge.test.ts`

**Interfaces:**
- Consumes: `WindowAttention`(= `"none" | "input" | "approval"`, `attention-policy.ts`) — `applyAttentionSnapshot`이 이미 `snapshot.window`로 들고 있다.
- Produces: `dockBadgeText(attention: WindowAttention): string` — approval `"!"`, input `"●"`, none `""`.

- [ ] **Step 1: 실패하는 테스트 추가**

`window-badge.test.ts`에:

```ts
describe("dockBadgeText", () => {
  it("사이드바 배지와 같은 의미의 글자를 Dock에 단다", () => {
    expect(dockBadgeText("approval")).toBe("!");
    expect(dockBadgeText("input")).toBe("●");
    expect(dockBadgeText("none")).toBe("");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/main/window-badge.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`window-badge.ts`에 추가:

```ts
/** Dock 배지는 overlay 아이콘을 그릴 수 없으므로 TitleBar의 주의 표시와 같은 글자를 쓴다. */
export function dockBadgeText(attention: WindowAttention): string {
  if (attention === "approval") return "!";
  if (attention === "input") return "●";
  return "";
}
```

`index.ts`:

① `Menu.setApplicationMenu(null)` 자리(whenReady 안)를 다음으로 교체:

```ts
    // The renderer draws its own menu bar. On macOS the system menu bar still has to exist for
    // Cmd+Q/C/V/H/M and dictation to work, so a minimal role-only menu replaces null there.
    if (process.platform === "darwin") {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([{ role: "appMenu" }, { role: "editMenu" }, { role: "windowMenu" }]),
      );
    } else {
      Menu.setApplicationMenu(null);
    }
```

② 같은 whenReady 체인에서 `app.on("second-instance", …)` 등록부 근처에 추가:

```ts
  // macOS: Dock 아이콘 클릭(활성화)이 숨긴 창을 되살린다 — 트레이 더블클릭과 같은 길.
  if (process.platform === "darwin") {
    app.on("activate", () => {
      if (runtime && mainWindow) restoreMainWindow();
    });
  }
```

③ `applyAttentionSnapshot`의 win32 분기 아래(else 쪽)에:

```ts
  if (process.platform === "darwin") app.dock?.setBadge(dockBadgeText(snapshot.window));
```

(`app`·`dockBadgeText` import 추가. `app.dock`은 darwin에서만 존재하므로 옵셔널 체이닝.)

- [ ] **Step 4: 통과 확인 + 수동 확인**

Run: `npm run typecheck && npx vitest run src/main/window-badge.test.ts`
Expected: PASS
Run: `npm run dev` — ① 메뉴바에 앱 메뉴가 뜨고 `Cmd+Q`로 종료된다(세션을 하나 띄운 채 종료 → 재시작 시 중단 세션 복원 안내가 뜨는지 — 기존 before-quit 정리 흐름 확인) ② 입력창에서 `Cmd+C/V`가 동작한다 ③ 창을 닫고(트레이 상주) Dock 아이콘 클릭으로 복귀한다. Task 7의 터미널 Cmd+C/V 수동 확인을 여기서 재검한다.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts src/main/window-badge.ts src/main/window-badge.test.ts
git commit -m "feat: macOS app menu, dock badge, and activate restore"
```

### Task 10: 트레이 — darwin 템플릿 아이콘

**Files:**
- Modify: `src/main/tray-icon.ts` (+`trayTemplateBitmap`)
- Modify: `src/main/index.ts` (`createTray`)
- Test: `src/main/tray-icon.test.ts`

**Interfaces:**
- Produces: `trayTemplateBitmap(size: 16 | 32): Buffer` — BGRA premultiplied, 검정 `>_` 글리프(알파만 의미 있음). index.ts가 `nativeImage.createFromBitmap` + `setTemplateImage(true)`로 쓴다. `window-badge.ts`의 `attentionDotBitmap`과 같은 "Electron 무의존 픽셀 드로잉" 방식.

- [ ] **Step 1: 실패하는 테스트 추가**

`tray-icon.test.ts`에(파일이 없으면 `// @vitest-environment node`로 생성):

```ts
import { describe, expect, it } from "vitest";
import { trayTemplateBitmap } from "./tray-icon";

describe("trayTemplateBitmap", () => {
  it("BGRA 버퍼 크기가 맞고, 글리프 픽셀은 검정이며 알파가 있다", () => {
    for (const size of [16, 32] as const) {
      const bitmap = trayTemplateBitmap(size);
      expect(bitmap.length).toBe(size * size * 4);
      let opaque = 0;
      for (let offset = 0; offset < bitmap.length; offset += 4) {
        const alpha = bitmap[offset + 3];
        if (alpha === 0) continue;
        opaque += 1;
        // premultiplied-BGRA 검정: 색 채널은 전부 0이어야 한다.
        expect(bitmap[offset]).toBe(0);
        expect(bitmap[offset + 1]).toBe(0);
        expect(bitmap[offset + 2]).toBe(0);
      }
      // `>`와 `_`가 실제로 그려졌다 — 전체의 5% 이상이 불투명.
      expect(opaque).toBeGreaterThan(size * size * 0.05);
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/main/tray-icon.test.ts`
Expected: FAIL — 함수가 없다.

- [ ] **Step 3: 구현**

`tray-icon.ts`에 추가:

```ts
/**
 * darwin 메뉴바용 템플릿 이미지의 픽셀. 템플릿은 "검정 + 알파"만 읽으므로(라이트/다크 메뉴바가
 * 알아서 반전) 기존 컬러 PNG 대신 `>_` 글리프를 직접 그린다 — window-badge의 attentionDotBitmap과
 * 같은 Electron 무의존 방식이라 유닛 테스트가 된다.
 */
export function trayTemplateBitmap(size: 16 | 32): Buffer {
  const bytes = Buffer.alloc(size * size * 4);
  const scale = size / 16;
  const stroke = Math.max(1, Math.round(1.6 * scale));
  const paint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    bytes[offset + 3] = 255; // BGRA 검정은 B=G=R=0, A=255
  };
  const paintBox = (x: number, y: number) => {
    for (let dy = 0; dy < stroke; dy += 1) for (let dx = 0; dx < stroke; dx += 1) paint(x + dx, y + dy);
  };
  // `>` — (3,4)→(7,8)→(3,12)의 두 사선 (16px 기준, scale로 확대)
  const steps = Math.round(4 * scale);
  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(3 * scale) + step;
    paintBox(x, Math.round(4 * scale) + step);
    paintBox(x, Math.round(12 * scale) - step - stroke + 1);
  }
  // `_` — 오른쪽 아래 밑줄
  for (let x = Math.round(9 * scale); x <= Math.round(13 * scale); x += 1) {
    paintBox(x, Math.round(11.5 * scale));
  }
  return bytes;
}
```

`index.ts`의 `createTray` 아이콘 생성부를 플랫폼 분기로 교체:

```ts
function createTray(): Tray {
  let icon: Electron.NativeImage;
  if (process.platform === "darwin") {
    icon = nativeImage.createFromBitmap(trayTemplateBitmap(16), { width: 16, height: 16 });
    icon.addRepresentation({ scaleFactor: 2, buffer: trayTemplateBitmap(32), width: 32, height: 32 });
    icon.setTemplateImage(true);
  } else {
    icon = nativeImage.createFromDataURL(trayIconDataUrl(16));
    icon.addRepresentation({ scaleFactor: 2, dataURL: trayIconDataUrl(32) });
  }
  if (icon.isEmpty()) {
    console.error("Tray icon failed to decode; the tray icon will be invisible.");
  }
  const nextTray = new Tray(icon);
  …이하 기존 그대로…
```

(`trayTemplateBitmap` import 추가. darwin은 기존 `else { double-click }` 분기에 이미 포함 — 변경 없음.)

- [ ] **Step 4: 통과 확인 + 수동 확인**

Run: `npx vitest run src/main/tray-icon.test.ts && npm run typecheck`
Expected: PASS
Run: `npm run dev` — 메뉴바 오른쪽에 `>_` 글리프가 라이트/다크 어디서든 또렷하다. 글리프가 뭉개지면 Step 3의 좌표 상수만 다듬는다(테스트는 형태가 아니라 계약만 고정한다).

- [ ] **Step 5: Commit**

```bash
git add src/main/tray-icon.ts src/main/tray-icon.test.ts src/main/index.ts
git commit -m "feat: template tray icon for the macOS menu bar"
```

---

## Phase 2 — 패키징과 검증

### Task 11: dist:mac 패키징

**Files:**
- Create: `build/icon-mac.png` (1024×1024)
- Modify: `package.json` (`scripts` + `build`)

- [ ] **Step 1: macOS 전용 아이콘 자산 만들기**

기존 `build/icon.png`는 **256×256**이다. electron-builder는 icns 변환의 하한이 512이고
(`app-builder-lib/out/util/iconConverter.js`의 `const recommendedMin = format === "icns" ? 512 : 256`),
미달이면 `ERR_ICON_TOO_SMALL`을 던져 **빌드를 중단한다**(linux는 하한이 256이라 통과한다).
그래서 `build/icon.png`는 **그대로 두고**(win/linux 산출물 불변) 별도 파일을 만든다:

```bash
sips -z 1024 1024 build/icon.png --out build/icon-mac.png
```

(256→1024 업스케일이라 큰 사이즈에서 다소 뭉개진다. Dock·Finder 선명도는 Task 13 체크리스트에
"고해상도 원본으로 교체" 항목으로 남기고, 지금은 브랜딩 없는 기본 Electron 아이콘을 피하는 것이 목적이다.)

- [ ] **Step 2: 스크립트와 빌드 설정 추가**

`scripts`의 `dist:linux:x64` 아래에:

```json
    "dist:mac": "npm run build && electron-builder --mac dmg zip --arm64 --publish never",
```

`build`의 `"linux"` 블록 아래에(형제 키로):

```json
    "mac": {
      "target": [
        { "target": "dmg", "arch": ["arm64"] },
        { "target": "zip", "arch": ["arm64"] }
      ],
      "category": "public.app-category.developer-tools",
      "icon": "build/icon-mac.png",
      "identity": null,
      "artifactName": "Multi-CLI-Work-${version}-mac-${arch}.${ext}"
    },
```

(zip 타깃은 Phase 4에서 자동 업데이트를 켤 때 필요하므로 지금부터 함께 만든다. `identity: null`은 ad-hoc 서명.)

- [ ] **Step 3: 빌드 실행**

Run: `npm run dist:mac`
Expected: `release/`에 `Multi-CLI-Work-1.48.0-mac-arm64.dmg`와 `.zip` 생성. `build/mobile`이 없다는 electron-builder 경고는 정상(로컬 dist는 셸 APK 미동봉 — 기존 win/linux와 동일).

- [ ] **Step 4: 설치본 수동 검증**

① dmg를 열어 앱을 `/Applications`에 복사 ② Finder에서 **우클릭 → 열기**(Gatekeeper 통과) ③ zsh 세션 생성·입출력 ④ 창 닫기 → 메뉴바 트레이에서 복귀 ⑤ 업데이트 배지가 `수동 업데이트` + `릴리스` 버튼인지 ⑥ 알림: 세션 하나를 입력 대기 상태로 두고 창을 숨겨 데스크톱 알림이 오는지(첫 알림에서 OS 권한 허용). 알림이 안 오면 시스템 설정 › 알림에서 앱 허용 상태를 확인하고 결과를 기록한다.

- [ ] **Step 5: Commit**

```bash
git add package.json build/icon-mac.png
git commit -m "feat: add macOS dmg/zip packaging target"
```

### Task 12: e2e 스모크 — macOS 트리아지

**Files:**
- Modify: `e2e/*.spec.ts` (필요한 곳만), `playwright.config.ts`(필요시)

**배경:** e2e의 플랫폼 분기는 전부 `win32` vs 나머지라 macOS는 bash 경로를 탄다. `session-workspace.spec.ts`(PowerShell 전용)와 `codex-resume.spec.ts`(Windows 런처 전용)는 이미 비Windows에서 skip된다.

`test:e2e:smoke`는 `playwright test --grep @smoke`이고 **`@smoke` 태그는 `desktop.spec.ts`의 9개 테스트에만** 붙어 있다. 즉 Step 2의 `session-activity.spec.ts` 수정은 스모크로 검증되지 않으므로 그 파일은 따로 돌린다.

- [ ] **Step 1: 스모크 실행**

Run: `npm run test:e2e:smoke`
Expected: 통과가 목표. 실패가 있으면 실패 목록을 기록한다.

- [ ] **Step 2: 실패 트리아지 — 수정 원칙**

실패마다 셋 중 하나로 처리하고, 셋째는 최후 수단이다:
1. **앱 버그**(darwin 분기 누락)면 해당 소스를 고치고 유닛 테스트를 함께 추가한다.
2. **테스트의 OS 가정**(예: 경로 구분자, `bash` 고정 kind가 아니라 zsh가 뜨는 것)이면 테스트를 `!== "win32"` 기준으로 일반화한다. Task 4 이후 macOS의 기본 셸 kind는 `zsh`이므로 `session-activity.spec.ts:31`의 kind 선택은 다음으로 바꾼다:

```ts
      kind: process.platform === "win32" ? "powershell" : process.platform === "darwin" ? "zsh" : "bash",
```

3. **macOS에서 의미 없는 시나리오**(Windows 설치본 동작 등)만 `test.skip(process.platform === "darwin", "<구체적 이유>")`로 스킵한다. 이유 없는 스킵 금지.

**이미 확인된 실패 둘 — `desktop.spec.ts`의 "@smoke drives the app from its own title bar"(722행).**
앞선 태스크가 바꾼 동작을 그대로 반영하므로 둘 다 2번(테스트의 OS 가정) 처리다. 스킵하지 않는다.

`desktop.spec.ts:12`의 `const WINDOWS = …` 옆에 추가:

```ts
const MAC = process.platform === "darwin";
```

① 723행 `expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)).toBe(true);`
— Task 9에서 darwin은 role 전용 메뉴를 설정하므로 null이 아니다. 다음으로 교체:

```ts
    if (MAC) {
      // Task 9: macOS는 Cmd+Q/C/V와 받아쓰기를 살리려고 role 전용 메뉴만 둔다 — 앱을 구동하는 메뉴가 아니다.
      expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items.length ?? 0)).toBe(3);
    } else {
      expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu() === null)).toBe(true);
    }
```

② 734-736행의 `["최소화", "최대화", "닫기"]` 버튼 단정 — `TitleBar.tsx:264`가 `{isMac ? null : (…)}`이라
darwin에는 버튼이 **존재하지 않는다**(Task 2·3의 네이티브 신호등). 다음으로 교체:

```ts
    if (MAC) {
      // hiddenInset 창의 네이티브 신호등이 그 자리를 대신한다(Task 2·3).
      await expect(titleBar.locator(".window-controls")).toHaveCount(0);
    } else {
      for (const label of ["최소화", "최대화", "닫기"]) {
        await expect(titleBar.getByRole("button", { name: label })).toBeVisible();
      }
    }
```

같은 테스트 730행의 `expect(geometry).toEqual({ top: 0, height: 35 })`는 **건드리지 않는다** —
`index.css:325`의 `.title-bar-mac { padding-left: 76px; }`는 좌측 패딩만 바꾸고 높이·top은 그대로다.

- [ ] **Step 3: 전체 스모크 재실행 + 비스모크 회귀**

Run: `npm run test:e2e:smoke`
Expected: PASS (스킵 제외). 남는 실패가 있으면 그 목록과 원인을 커밋 메시지 본문에 남기고 다음 태스크로 넘어가지 않는다.

Run: `npx playwright test e2e/session-activity.spec.ts`
Expected: PASS — Step 2에서 바꾼 zsh kind 선택이 실제로 통하는지 확인한다(스모크에 포함되지 않는 파일).

- [ ] **Step 4: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: run the e2e smoke suite on macOS"
```

### Task 13: macOS 수동 검증 체크리스트 (§3.6–3.7)

**Files:** 없음 (검증만; 발견된 버그는 각각 유닛 테스트와 함께 고쳐 개별 커밋)

- [ ] **Step 1: `jk` 제어 CLI** — zsh 세션에서 `which jk` → userData의 `bin/jk`(패키징본은 `~/Library/Application Support/multi-cli-work/bin/jk`) 확인, `jk --help` 실행, `echo $JK_CODING_CLI_ENDPOINT $JK_CODING_CLI_TOKEN`이 세션 환경에 있는지 확인(POSIX 경로는 named pipe 대신 이 둘을 쓴다).
- [ ] **Step 2: Python3** — `python3 --version`이 CLT 동봉판으로 응답(상태 훅 의존).
- [ ] **Step 3: safeStorage** — 설정 › 노션에 아무 토큰이나 저장 → 앱 재시작 → 저장 상태 유지 확인(Keychain 암호화 경로) → 토큰 삭제.
- [ ] **Step 4: 진행률** — 세션에서 `printf '\e]9;4;1;50\a'` 실행 → 패인 진행선과 Dock 아이콘 진행률 표시 확인, `printf '\e]9;4;0;0\a'`로 해제.
- [ ] **Step 5: 전역 단축키** — 설정 › 일반의 소환 단축키를 등록하고 창을 숨긴 뒤 복귀 확인.
- [ ] **Step 6: Google Drive 루트** — 설정의 워크스페이스 루트에 아무 로컬 폴더를 수동 지정해 업무 프로젝트 스캔이 도는지 확인(darwin 자동 탐지는 범위 밖).
- [ ] **Step 7: 결과 기록** — 체크 결과를 이 플랜 파일에 채워 커밋: `git commit -am "chore: record macOS manual verification"`

---

## Phase 3 — iPhone 웹

### Task 14: 홈 화면 메타 + apple-touch-icon

**Files:**
- Create: `src/renderer/public/apple-touch-icon.png` (180×180, `build/icon.png`에서 생성)
- Modify: `src/renderer/mobile.html`
- Modify: `src/main/remote/remote-server.ts` (아이콘 라우트)
- Test: `src/main/remote/remote-server.test.ts`

**Interfaces:**
- Produces: `GET /mobile/apple-touch-icon.png` → 200 `image/png` (rendererDir 루트의 파일; electron-vite가 `src/renderer/public/*`를 `out/renderer/`로 복사)

- [ ] **Step 1: 아이콘 생성**

Run: `mkdir -p src/renderer/public && sips -z 180 180 build/icon.png --out src/renderer/public/apple-touch-icon.png`
Expected: 180×180 PNG 생성. `npm run build` 후 `ls out/renderer/apple-touch-icon.png`로 복사 확인.

- [ ] **Step 2: 실패하는 테스트 추가**

`remote-server.test.ts`의 기존 정적 서빙 테스트(rendererDir 픽스처를 만드는 헬퍼)를 본떠:

```ts
it("serves the apple touch icon from the renderer root", async () => {
  // 기존 헬퍼로 rendererDir에 apple-touch-icon.png 더미 파일을 쓴 뒤 서버 시작
  const response = await fetch(`http://${host}:${port}/mobile/apple-touch-icon.png`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/main/remote/remote-server.test.ts`
Expected: FAIL — 404.

- [ ] **Step 4: 구현**

`remote-server.ts`의 `handleRequest`에서 `/mobile` 분기 아래, `assetPrefix` 분기 위에:

```ts
  if (pathname === "/mobile/apple-touch-icon.png") {
    const served = await serveFile(response, path.join(options.rendererDir, "apple-touch-icon.png"), "public, max-age=86400");
    if (!served) send(response, 404, "없는 경로입니다");
    return;
  }
```

`mobile.html` `<head>`의 `theme-color` 아래에:

```html
    <link rel="apple-touch-icon" href="/mobile/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="멀티 터미널 작업기" />
```

- [ ] **Step 5: 통과 확인 + Commit**

Run: `npx vitest run src/main/remote/remote-server.test.ts && npm run build`
Expected: PASS, `out/renderer/apple-touch-icon.png` 존재.

```bash
git add src/renderer/public/apple-touch-icon.png src/renderer/mobile.html src/main/remote/remote-server.ts src/main/remote/remote-server.test.ts
git commit -m "feat: home-screen metadata for the iPhone web companion"
```

### Task 15: 모바일 CSS — 하단·좌우 safe area

**Files:**
- Modify: `src/renderer/src/mobile/mobile.css`

**배경:** 상단(`.m-bar`의 `padding-top: max(8px, env(safe-area-inset-top))`)과 하단(`.m-composer:59`·`.m-toast:81`의 `env(safe-area-inset-bottom)`)은 이미 적용돼 있다. 남은 것은 **가로 모드 좌우 노치**뿐이다.

- [ ] **Step 1: 좌우 패딩 적용**

`mobile.css`의 `html, body, #root { … }` 규칙(11행) 아래 `body` 규칙(12행)에 추가:

```css
body { background: var(--m-bg); color: var(--m-text); font: 15px/1.4 system-ui, sans-serif; padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
```

- [ ] **Step 2: 데스크톱 회귀 확인**

Run: `npx vitest run src/renderer/src/mobile && npm run build`
Expected: PASS — inset이 0인 데스크톱/Android에서는 변화가 없다. 실기기 시각 확인은 Task 17 Step 5에서 한다.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/mobile/mobile.css
git commit -m "feat: respect iPhone safe areas in the mobile ui"
```

### Task 16: /install 페이지 — iPhone 안내

**Files:**
- Modify: `src/main/remote/remote-server.ts` (`installPage`)
- Test: `src/main/remote/remote-server.test.ts`

- [ ] **Step 1: 실패하는 테스트 추가**

```ts
it("install page explains the iPhone home-screen flow", async () => {
  const response = await fetch(`http://${host}:${port}/install`);
  const html = await response.text();
  expect(html).toContain("홈 화면에 추가");
  expect(html).toContain("/mobile/");
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/main/remote/remote-server.test.ts`
Expected: FAIL

- [ ] **Step 3: 구현**

`installPage`의 return 직전에 iPhone 섹션을 만들어 양쪽 분기 모두에 덧붙인다:

```ts
  const iphone = `<h2>iPhone</h2>
<ol>
<li>iPhone에 Tailscale을 설치하고 이 PC와 같은 tailnet에 로그인합니다.</li>
<li>Safari에서 이 주소의 <a href="/mobile/">/mobile/</a>을 열고 PC의 설정 ▸ 원격 ▸ 기기 추가 코드를 입력합니다.</li>
<li>공유 ▸ <b>홈 화면에 추가</b>로 설치하면 전체 화면으로 열리고, 페어링이 7일 미사용 정리 없이 유지됩니다.</li>
</ol>`;
```

기존 `body` 할당의 Android 안내는 `<h2>Android</h2>` 제목을 달아 구분하고, `return` 템플릿의 `${body}`를 `${body}${iphone}`으로 바꾼다.

- [ ] **Step 4: 통과 확인 + Commit**

Run: `npx vitest run src/main/remote/remote-server.test.ts`
Expected: PASS

```bash
git add src/main/remote/remote-server.ts src/main/remote/remote-server.test.ts
git commit -m "feat: iphone install guidance on the remote install page"
```

### Task 17: iPhone 실기기 검증 체크리스트

**Files:** 없음 (검증만; 발견 버그는 개별 수정·커밋)

**준비:** Mac에서 패키징본(또는 `npm run dev`) 실행 → 설정 ▸ 원격 ▸ 원격 접속 허용 ON. iPhone에 Tailscale 설치·로그인(같은 tailnet).

- [ ] **Step 1: 접속·페어링** — iPhone Safari에서 `http://<Mac의 Tailscale 주소>:<포트>/mobile/` → 페어링 코드 입력 → 세션 목록 표시.
- [ ] **Step 2: 홈 화면 추가** — 공유 ▸ 홈 화면에 추가 → 아이콘(Task 14)이 제대로 보이고, 열면 Safari UI 없는 전체 화면 + 상태바 영역이 자연스러운지(black-translucent).
- [ ] **Step 3: 터미널 입출력** — 세션 열어 명령 실행, 출력 스크롤(관성), 맨 아래로 복귀 동작.
- [ ] **Step 4: 키보드** — 입력줄 포커스 시 키보드가 내용을 가리지 않고(visualViewport 리사이즈), 닫을 때 복원.
- [ ] **Step 5: 회전** — 가로 모드에서 좌우 safe-area(Task 15)와 레이아웃 확인.
- [ ] **Step 6: 재시작 유지** — 홈 화면 앱을 완전히 내렸다 다시 열어 페어링 유지(localStorage) 확인.
- [ ] **Step 7: 대기 점프·상태 색** — 데스크톱에서 세션 하나를 입력 대기로 만들고, 폰의 **대기** 버튼이 그 세션으로 가는지.
- [ ] **Step 8: 결과 기록** — 어긋난 항목은 `src/renderer/src/mobile/`의 해당 모듈(`touch-scroll`·`terminal-input`·`auto-fit`·`initial-size`)에 유닛 테스트와 함께 고치고 개별 커밋. 체크 결과를 이 플랜에 채워 커밋: `git commit -am "chore: record iPhone web verification"`

---

## 완료 기준

- Phase 1–2: macOS에서 `npm test`·`npm run typecheck`·`test:e2e:smoke` 통과, dmg 설치본으로 일상 사용 가능(zsh 세션·트레이·Dock·수동 업데이트 안내).
- Phase 3: iPhone 홈 화면 앱으로 페어링→세션 조작이 되고 Task 17 체크리스트가 채워져 있다.
- 모든 변경이 win/linux 기본 동작을 바꾸지 않았다(기존 테스트 무수정 통과가 그 증거; platform 인자가 추가된 테스트는 `"win32"` 기대값 유지).
