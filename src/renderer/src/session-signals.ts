import type { TerminalStatus } from "@shared/terminal-types";
import { createContext, useContext } from "react";

/** A one-shot "this just happened" mark on a session — drawn briefly, then dropped. */
export type SessionSignal = "completed" | "failed";

/** How long a pane and its rows carry the mark. Long enough to catch from the corner of an eye. */
export const SESSION_SIGNAL_MS = 2400;

/**
 * A turn shorter than this is not news: an agent flickering through working on a keystroke or a
 * status probe would otherwise flash the grid on every redraw.
 */
export const MIN_WORKED_MS = 2000;

/**
 * Which mark, if any, a status change earns. A turn ends the way the attention policy already reads
 * it — back to idle, or waiting for input (Claude Code's Stop hook lands there). Waiting for
 * approval is mid-turn, so it is not a completion.
 */
export function sessionSignalFor(from: TerminalStatus, to: TerminalStatus, workedMs: number): SessionSignal | null {
  if (to === "error" && from !== "error") return "failed";
  if (from === "working" && (to === "idle" || to === "awaiting-input") && workedMs >= MIN_WORKED_MS) {
    return "completed";
  }
  return null;
}

export const SessionSignalsContext = createContext<ReadonlyMap<string, SessionSignal>>(new Map());

/** The class a pane or row adds while it carries a mark, or "" — ready to drop into a class list. */
export function signalClassOf(signals: ReadonlyMap<string, SessionSignal>, sessionId: string): string {
  const signal = signals.get(sessionId);
  return signal ? `just-${signal}` : "";
}

export function useSessionSignalClass(sessionId: string): string {
  return signalClassOf(useContext(SessionSignalsContext), sessionId);
}
