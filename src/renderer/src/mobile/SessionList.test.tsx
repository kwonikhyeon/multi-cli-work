import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionList } from "./SessionList";

afterEach(cleanup);

describe("SessionList", () => {
  it("shows status badges and opens a session", () => {
    const onOpen = vi.fn();
    render(
      <SessionList
        hostName="PC"
        connection="open"
        sessions={[
          { id: "1", projectId: "p", projectName: "A", kind: "claude", label: "리팩터", status: "awaiting-input", updatedAt: "" },
        ]}
        onOpen={onOpen}
        onUnpair={vi.fn()}
        onNewSession={vi.fn()}
        leaveLabel="호스트 목록"
      />,
    );
    expect(screen.getByRole("button", { name: "호스트 목록" })).toBeInTheDocument();
    expect(screen.getByText("입력 대기")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /리팩터/ }));
    expect(onOpen).toHaveBeenCalledWith("1");
  });

  it("shows which worktree a session runs in", () => {
    render(
      <SessionList
        hostName="PC"
        connection="open"
        sessions={[
          { id: "1", projectId: "p", projectName: "A", kind: "claude", label: "리팩터", status: "idle", updatedAt: "", worktreeBranch: "feat/search" },
        ]}
        onOpen={vi.fn()}
        onUnpair={vi.fn()}
        onNewSession={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /리팩터.*feat\/search/ })).toBeInTheDocument();
  });

  it("gathers waiting sessions at the top with their folder, and jumps to one", () => {
    const onOpen = vi.fn();
    render(
      <SessionList
        hostName="PC"
        connection="open"
        sessions={[
          { id: "1", projectId: "p", projectName: "A", kind: "claude", label: "리팩터", status: "working", updatedAt: "" },
          { id: "2", projectId: "q", projectName: "B", kind: "codex", label: "검토", status: "awaiting-approval", updatedAt: "" },
        ]}
        onOpen={onOpen}
        onUnpair={vi.fn()}
        onNewSession={vi.fn()}
      />,
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["대기 중", "A"]);
    expect(within(screen.getByRole("region", { name: "대기 중" })).getByRole("button", { name: /검토.*B · codex/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "대기 1" }));
    expect(onOpen).toHaveBeenCalledWith("2");
  });

  it("says when there is nothing to show and when the link is down", () => {
    render(<SessionList hostName="PC" connection="reconnecting" sessions={[]} onOpen={vi.fn()} onUnpair={vi.fn()} onNewSession={vi.fn()} />);
    expect(screen.getByText("열린 세션이 없습니다")).toBeInTheDocument();
    expect(screen.getByText("다시 연결하는 중…")).toBeInTheDocument();
  });
});
