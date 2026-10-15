/** 폰 키보드에 없는 키. 1·2·3은 CLI의 승인 선택지, /는 슬래시 명령이다. */
export const QUICK_KEYS: ReadonlyArray<{ label: string; ariaLabel: string; data: string }> = [
  { label: "Esc", ariaLabel: "Esc", data: "\x1b" },
  { label: "Tab", ariaLabel: "Tab", data: "\t" },
  { label: "←", ariaLabel: "왼쪽 화살표", data: "\x1b[D" },
  { label: "→", ariaLabel: "오른쪽 화살표", data: "\x1b[C" },
  { label: "↑", ariaLabel: "위 화살표", data: "\x1b[A" },
  { label: "↓", ariaLabel: "아래 화살표", data: "\x1b[B" },
  { label: "Enter", ariaLabel: "Enter", data: "\r" },
  { label: "^C", ariaLabel: "Ctrl+C", data: "\x03" },
  { label: "1", ariaLabel: "1", data: "1" },
  { label: "2", ariaLabel: "2", data: "2" },
  { label: "3", ariaLabel: "3", data: "3" },
  { label: "/", ariaLabel: "슬래시", data: "/" },
];

/**
 * 입력창 내용을 PTY로 보낼 바이트로. 여러 줄은 bracketed paste로 감싸 CLI가 줄바꿈마다 제출하지
 * 않게 하고, 마지막에 Enter를 한 번 누른다.
 */
export function encodeComposerInput(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  if (!normalized.includes("\n")) return `${normalized}\r`;
  return `\x1b[200~${normalized.replace(/\n/g, "\r")}\x1b[201~\r`;
}

/**
 * replay와 실시간 출력을 이어 붙이는 문. attached 전의 출력은 모아 두었다가 replay 뒤에
 * sequence가 더 큰 것만 쓴다 — 데스크톱 TerminalPane과 같은 규칙.
 */
export function createReplayGate(write: (data: string) => void) {
  let lastSequence: number | null = null;
  const pending: Array<{ data: string; sequence: number }> = [];
  return {
    reset() {
      lastSequence = null;
      pending.length = 0;
    },
    attached(replay: string, sequence: number) {
      write(replay);
      lastSequence = sequence;
      for (const output of pending) {
        if (output.sequence > lastSequence) {
          write(output.data);
          lastSequence = output.sequence;
        }
      }
      pending.length = 0;
    },
    data(data: string, sequence: number) {
      if (lastSequence === null) {
        pending.push({ data, sequence });
        return;
      }
      if (sequence <= lastSequence) return;
      write(data);
      lastSequence = sequence;
    },
  };
}

export type ClipboardKeyAction = "copy" | "paste" | "swallow" | null;

/**
 * 이 모바일 번들은 iPhone·iPad Safari, Mac 브라우저, Electron 원격 창 모두에서 돌고 `window.multiCliWork`가
 * 없다(그 프리로드 셸 브리지는 원격 창에만 있다) — 그래서 TerminalPane처럼 `platform === "darwin"`을 못 쓰고
 * `navigator.platform`을 호출부(SessionScreen)에서 읽어 순수 함수로 넘긴다. iPadOS 13+는 "데스크톱 사이트
 * 요청"이 꺼져 있어도 `navigator.platform`이 "MacIntel"로 나오는데, 거기도 하드웨어 키보드의 복사·붙여넣기는
 * Cmd 하나뿐이라 Mac과 같이 취급하는 것이 맞는 동작이다.
 */
export function isApplePlatform(platform: string): boolean {
  return platform.startsWith("Mac") || platform === "iPhone" || platform === "iPad" || platform === "iPod";
}

/**
 * 데스크톱 TerminalPane과 같은 키 규칙. Ctrl+C는 선택이 있을 때만 복사이고(없으면 인터럽트로 PTY에
 * 간다), Ctrl+Shift+C는 복사할 것이 없어도 복사 키로 먹는다. Ctrl+V·Ctrl+Shift+V는 붙여넣기다.
 *
 * macOS·iPadOS·iOS(Apple 플랫폼)에서는 이 Ctrl 분기를 전부 건너뛴다 — TerminalPane.tsx:224-226과 같은
 * 이유다. 복사·붙여넣기는 Cmd+C/Cmd+V뿐이고(그 키는 바로 아래 metaKey 분기에서 이미 null을 돌려준다),
 * Ctrl+C는 인터럽트·Ctrl+V는 quoted-insert로 그대로 PTY에 가야 한다. `isApple`은 기본값을 두지 않은
 * 필수 인자다 — 기본값 `false`는 "분기를 잊으면 Windows·Linux처럼 동작"하게 만들어 이번과 같은 버그를
 * 그대로 재현한다.
 */
export function clipboardKeyAction(
  event: Pick<KeyboardEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "code" | "key">,
  hasSelection: boolean,
  isApple: boolean,
): ClipboardKeyAction {
  if (isApple) return null;
  if (!event.ctrlKey || event.altKey || event.metaKey) return null;
  const key = event.code || event.key;
  if (key === "KeyV") return "paste";
  if (key !== "KeyC") return null;
  if (hasSelection) return "copy";
  return event.shiftKey ? "swallow" : null;
}
