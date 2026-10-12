import { describe, expect, it } from "vitest";
import type { RemoteSessionSummary } from "@shared/remote-types";
import {
  applySessionMessage,
  awaitingCount,
  groupSessions,
  isAwaiting,
  nextAwaiting,
  splitAwaiting,
} from "./session-list-model";

const s = (id: string, overrides: Partial<RemoteSessionSummary> = {}): RemoteSessionSummary => ({
  id,
  projectId: "p",
  projectName: "A",
  kind: "claude",
  label: id,
  status: "working",
  updatedAt: "2026-09-30T00:00:00.000Z",
  ...overrides,
});

describe("applySessionMessage", () => {
  it("replaces, adds, and updates sessions", () => {
    let list = applySessionMessage([], { type: "sessions", sessions: [s("1")] });
    list = applySessionMessage(list, { type: "created", session: s("2") });
    list = applySessionMessage(list, { type: "created", session: s("2", { label: "again" }) });
    list = applySessionMessage(list, { type: "status", sessionId: "1", status: "awaiting-input" });
    list = applySessionMessage(list, { type: "title", sessionId: "2", title: "새 제목" });
    list = applySessionMessage(list, { type: "exit", sessionId: "1", exitCode: 0 });
    expect(list.map((entry) => [entry.id, entry.status, entry.label])).toEqual([
      ["1", "exited", "1"],
      ["2", "working", "새 제목"],
    ]);
  });

  it("drops a removed session", () => {
    const list = applySessionMessage([s("1"), s("2")], { type: "removed", sessionId: "1" });
    expect(list.map((entry) => entry.id)).toEqual(["2"]);
  });

  it("takes a known session's new state from a created event — a restart announces itself that way", () => {
    const list = applySessionMessage([s("1", { status: "exited" }), s("2")], {
      type: "created",
      session: s("1", { status: "starting" }),
    });
    expect(list.map((entry) => [entry.id, entry.status])).toEqual([
      ["1", "starting"],
      ["2", "working"],
    ]);
  });

  it("ignores unrelated messages and returns the same array", () => {
    const list = [s("1")];
    expect(applySessionMessage(list, { type: "data", sessionId: "1", data: "x", sequence: 1 })).toBe(list);
  });
});

describe("groupSessions", () => {
  it("groups by project, newest first, with folderless sessions last", () => {
    const groups = groupSessions([
      s("old", { projectName: "B", updatedAt: "2026-09-29T00:00:00.000Z" }),
      s("tool", { projectId: null, projectName: null }),
      s("new", { projectName: "B", updatedAt: "2026-09-30T01:00:00.000Z" }),
      s("a", { projectName: "A" }),
    ]);
    expect(groups.map((group) => [group.projectName, group.sessions.map((entry) => entry.id)])).toEqual([
      ["A", ["a"]],
      ["B", ["new", "old"]],
      ["폴더 없음", ["tool"]],
    ]);
  });
});

describe("waiting sessions", () => {
  const sessions = [
    s("1", { status: "awaiting-input" }),
    s("2"),
    s("3", { status: "awaiting-approval" }),
    s("4", { status: "idle" }),
  ];

  it("counts only input and approval waits", () => {
    expect(isAwaiting("awaiting-input")).toBe(true);
    expect(isAwaiting("awaiting-approval")).toBe(true);
    expect(isAwaiting("idle")).toBe(false);
    expect(awaitingCount(sessions, null)).toBe(2);
    expect(awaitingCount(sessions, "3")).toBe(1);
  });

  it("finds the next waiting session after the current one, wrapping around", () => {
    expect(nextAwaiting(sessions, null)?.id).toBe("1");
    expect(nextAwaiting(sessions, "1")?.id).toBe("3");
    expect(nextAwaiting(sessions, "3")?.id).toBe("1");
    expect(nextAwaiting(sessions, "4")?.id).toBe("1");
  });

  it("skips the current session and gives null when nothing else waits", () => {
    expect(nextAwaiting([s("1", { status: "awaiting-input" }), s("2")], "1")).toBeNull();
    expect(nextAwaiting([], null)).toBeNull();
  });

  it("pulls waiting sessions out of their folders", () => {
    const { awaiting, groups } = splitAwaiting([
      s("w", { projectName: "B", status: "awaiting-input" }),
      s("a", { projectName: "A" }),
      s("b", { projectName: "B" }),
    ]);
    expect(awaiting.map((entry) => entry.id)).toEqual(["w"]);
    expect(groups.map((group) => [group.projectName, group.sessions.map((entry) => entry.id)])).toEqual([
      ["A", ["a"]],
      ["B", ["b"]],
    ]);
  });
});
