import type { TerminalStatus } from "@shared/terminal-types";
import type { RemoteSessionSummary } from "@shared/remote-types";

export { applySessionMessage } from "@shared/remote-session-list";

const NO_FOLDER = "폴더 없음";

/** 사람이 답해야 다음으로 넘어가는 상태 — 입력 대기와 승인 대기. */
export function isAwaiting(status: TerminalStatus): boolean {
  return status === "awaiting-input" || status === "awaiting-approval";
}

/** 지금 세션 다음부터 한 바퀴 돌며 찾은 대기 세션. 지금 세션은 빼고, 없으면 null. */
export function nextAwaiting(sessions: RemoteSessionSummary[], currentId: string | null): RemoteSessionSummary | null {
  const start = sessions.findIndex((session) => session.id === currentId);
  for (let step = 1; step <= sessions.length; step += 1) {
    const candidate = sessions[(start + step + sessions.length) % sessions.length];
    if (candidate.id !== currentId && isAwaiting(candidate.status)) return candidate;
  }
  return null;
}

/** 지금 세션을 뺀 대기 세션 수. */
export function awaitingCount(sessions: RemoteSessionSummary[], currentId: string | null): number {
  return sessions.filter((session) => session.id !== currentId && isAwaiting(session.status)).length;
}

const newestFirst = (a: RemoteSessionSummary, b: RemoteSessionSummary) => b.updatedAt.localeCompare(a.updatedAt);

export function groupSessions(sessions: RemoteSessionSummary[]) {
  const groups = new Map<string, RemoteSessionSummary[]>();
  for (const session of sessions) {
    const key = session.projectName ?? NO_FOLDER;
    groups.set(key, [...(groups.get(key) ?? []), session]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === NO_FOLDER ? 1 : b === NO_FOLDER ? -1 : a.localeCompare(b, "ko")))
    .map(([projectName, entries]) => ({
      projectName,
      sessions: [...entries].sort(newestFirst),
    }));
}

/** 목록 화면: 대기 세션을 폴더와 상관없이 맨 위에 모으고, 나머지는 폴더별로 묶는다. */
export function splitAwaiting(sessions: RemoteSessionSummary[]) {
  return {
    awaiting: sessions.filter((session) => isAwaiting(session.status)).sort(newestFirst),
    groups: groupSessions(sessions.filter((session) => !isAwaiting(session.status))),
  };
}
