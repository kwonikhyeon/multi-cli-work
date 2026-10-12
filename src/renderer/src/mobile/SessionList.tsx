import type { ReactNode } from "react";
import type { TerminalStatus } from "@shared/terminal-types";
import type { RemoteSessionSummary } from "@shared/remote-types";
import type { RemoteClientState } from "./remote-client";
import { awaitingCount, nextAwaiting, splitAwaiting } from "./session-list-model";

export const STATUS_LABEL: Record<TerminalStatus, string> = {
  starting: "시작 중",
  working: "작업 중",
  "awaiting-input": "입력 대기",
  "awaiting-approval": "승인 대기",
  idle: "대기",
  exited: "종료됨",
  error: "오류",
};

const CONNECTION_LABEL: Record<RemoteClientState, string | null> = {
  connecting: "연결 중…",
  open: null,
  reconnecting: "다시 연결하는 중…",
  unauthorized: "연결이 해제되었습니다",
  incompatible: "호스트와 버전이 맞지 않습니다",
};

interface SessionListProps {
  hostName: string;
  connection: RemoteClientState;
  sessions: RemoteSessionSummary[];
  onOpen(sessionId: string): void;
  onUnpair(): void;
  leaveLabel?: string;
  /** 넓은 화면에서 옆에 열려 있는 세션. */
  activeSessionId?: string | null;
  onNewSession(): void;
  /** 머리줄 아래에 그리는 것 — 새 세션 폼. */
  children?: ReactNode;
}

export function SessionList({
  hostName,
  connection,
  sessions,
  onOpen,
  onUnpair,
  leaveLabel,
  activeSessionId,
  onNewSession,
  children,
}: SessionListProps) {
  const banner = CONNECTION_LABEL[connection];
  const waiting = awaitingCount(sessions, activeSessionId ?? null);
  const { awaiting, groups } = splitAwaiting(sessions);
  const row = (session: RemoteSessionSummary, showFolder: boolean) => (
    <button
      type="button"
      className="m-session"
      key={session.id}
      aria-current={session.id === activeSessionId ? "true" : undefined}
      onClick={() => onOpen(session.id)}
    >
      <span className={`m-dot m-dot-${session.status}`} aria-hidden="true" />
      <span className="m-session-text">
        <span className="m-session-label">{session.label}</span>
        <small className="m-session-meta">
          {[showFolder ? (session.projectName ?? "폴더 없음") : null, session.kind, session.worktreeBranch]
            .filter(Boolean)
            .join(" · ")}
        </small>
      </span>
      <span className={`m-status m-status-${session.status}`}>{STATUS_LABEL[session.status]}</span>
    </button>
  );
  return (
    <main className="m-list">
      <header className="m-bar">
        <h1>{hostName}</h1>
        {waiting > 0 ? (
          <button
            type="button"
            className="m-await-jump"
            onClick={() => {
              const next = nextAwaiting(sessions, activeSessionId ?? null);
              if (next) onOpen(next.id);
            }}
          >
            대기 {waiting}
          </button>
        ) : null}
        <button type="button" disabled={connection !== "open"} onClick={onNewSession}>
          새 세션
        </button>
        <button type="button" onClick={onUnpair}>
          {leaveLabel ?? "연결 해제"}
        </button>
      </header>
      {banner ? <p className="m-banner">{banner}</p> : null}
      {children}
      {sessions.length === 0 ? <p className="m-empty">열린 세션이 없습니다</p> : null}
      {awaiting.length > 0 ? (
        <section className="m-awaiting-group" aria-label="대기 중">
          <h2>대기 중</h2>
          {awaiting.map((session) => row(session, true))}
        </section>
      ) : null}
      {groups.map((group) => (
        <section key={group.projectName} aria-label={group.projectName}>
          <h2>{group.projectName}</h2>
          {group.sessions.map((session) => row(session, false))}
        </section>
      ))}
    </main>
  );
}
