import type { FileTreeEntry } from "@shared/file-explorer-types";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileExplorer } from "./FileExplorer";

const target = { kind: "project", id: "p1" } as const;

const folder: FileTreeEntry = { name: "src", relativePath: "src", kind: "directory", extension: null, executable: false, mtimeMs: 0 };
const file: FileTreeEntry = { name: "readme.md", relativePath: "readme.md", kind: "file", extension: "md", executable: false, mtimeMs: 0 };
const nested: FileTreeEntry = { name: "main.ts", relativePath: "src/main.ts", kind: "file", extension: "ts", executable: false, mtimeMs: 0 };

const listDirectory = vi.fn();
const absolutePath = vi.fn();
const reveal = vi.fn();
const openInEditor = vi.fn();
const create = vi.fn();
const rename = vi.fn();
const duplicate = vi.fn();
const trash = vi.fn();
const panelData = vi.fn();
const writeText = vi.fn();
const changedPaths = vi.fn();
const clearChanges = vi.fn();
const projectReveal = vi.fn();
const worktreeReveal = vi.fn();

const onOpenFile = vi.fn();
const onOpenFileInApp = vi.fn();
const onOpenFileExternal = vi.fn();
const onEntryDeleted = vi.fn();
const onEntryRenamed = vi.fn();

function renderExplorer(activeTarget = target) {
  return render(
    <FileExplorer
      hidden={false}
      target={activeTarget}
      targetLabel="Repo"
      selectedRelativePath={null}
      vscodeAvailable
      onOpenFile={onOpenFile}
      onOpenFileInApp={onOpenFileInApp}
      onOpenFileExternal={onOpenFileExternal}
      onEntryDeleted={onEntryDeleted}
      onEntryRenamed={onEntryRenamed}
    />,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const row = (name: string) => screen.findByRole("button", { name: new RegExp(name) });
const openMenu = async (name: string) => {
  fireEvent.contextMenu(await row(name), { clientX: 12, clientY: 20 });
  return screen.findByRole("menu");
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FileExplorer context menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDirectory.mockImplementation(async (_target, relativePath: string) =>
      relativePath === "" ? [folder, file] : [nested],
    );
    absolutePath.mockResolvedValue("D:\\repo\\readme.md");
    reveal.mockResolvedValue(undefined);
    openInEditor.mockResolvedValue(undefined);
    create.mockResolvedValue("src/new.ts");
    rename.mockResolvedValue("guide.md");
    duplicate.mockResolvedValue("readme copy.md");
    trash.mockResolvedValue(undefined);
    panelData.mockResolvedValue({
      isRepo: true, currentBranch: "main", upstream: null, ahead: null, behind: null,
      branches: ["main"], changes: [], ignored: [],
    });
    writeText.mockResolvedValue(undefined);
    changedPaths.mockResolvedValue({ agentPaths: [], baselineMs: 0 });
    clearChanges.mockResolvedValue(undefined);
    projectReveal.mockResolvedValue(undefined);
    worktreeReveal.mockResolvedValue(undefined);
    Object.assign(window, {
      multiCliWork: {
        workspaceFiles: {
          listDirectory, absolutePath, reveal, openInEditor, create, rename, duplicate, trash,
          changedPaths, clearChanges,
        },
        projects: { reveal: projectReveal },
        worktrees: { reveal: worktreeReveal },
        git: { panelData },
        clipboard: { writeText },
      },
    });
  });

  it("does not list a folder that is gone and says why instead", async () => {
    render(
      <FileExplorer
        hidden={false}
        target={target}
        targetLabel="Repo"
        unavailableReason="폴더를 찾을 수 없습니다"
        selectedRelativePath={null}
        vscodeAvailable
        onOpenFile={onOpenFile}
        onOpenFileInApp={onOpenFileInApp}
        onOpenFileExternal={onOpenFileExternal}
        onEntryDeleted={onEntryDeleted}
        onEntryRenamed={onEntryRenamed}
      />,
    );

    expect(await screen.findByText("폴더를 찾을 수 없습니다")).toBeInTheDocument();
    expect(listDirectory).not.toHaveBeenCalled();
  });

  it("copies the absolute path, the relative path and the name", async () => {
    renderExplorer();
    await openMenu("readme.md");

    fireEvent.click(screen.getByRole("menuitem", { name: "경로 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("D:\\repo\\readme.md"));
    expect(absolutePath).toHaveBeenCalledWith(target, "readme.md");

    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "상대 경로 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("readme.md"));

    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "파일 이름 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("readme.md"));
  });

  it("targets the root folder when the click lands on empty space", async () => {
    renderExplorer();
    await screen.findByText("readme.md");

    fireEvent.contextMenu(screen.getByRole("tree"), { clientX: 5, clientY: 5 });
    const menu = await screen.findByRole("menu", { name: "루트 폴더 작업" });
    expect(within(menu).getByRole("menuitem", { name: "새 파일" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "이름 변경" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "삭제" })).not.toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "경로 복사" }));
    await waitFor(() => expect(absolutePath).toHaveBeenCalledWith(target, ""));
  });

  it("opens a folder before showing the new-file field and creates the entry", async () => {
    renderExplorer();
    await openMenu("src");
    fireEvent.click(screen.getByRole("menuitem", { name: "새 파일" }));

    // The folder was collapsed: the field only exists once its listing is on screen.
    await screen.findByText("main.ts");
    const field = screen.getByLabelText("파일 이름");
    fireEvent.change(field, { target: { value: "helper.ts" } });
    fireEvent.submit(field);

    await waitFor(() => expect(create).toHaveBeenCalledWith(target, "src", "helper.ts", "file"));
    // The parent listing is re-read so the new file appears without a full refresh.
    await waitFor(() => expect(listDirectory).toHaveBeenCalledWith(target, "src"));
  });

  it("abandons the inline field on Escape", async () => {
    renderExplorer();
    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "이름 변경" }));

    const field = await screen.findByLabelText("파일 이름");
    fireEvent.keyDown(field, { key: "Escape" });

    await waitFor(() => expect(screen.queryByLabelText("파일 이름")).not.toBeInTheDocument());
    expect(rename).not.toHaveBeenCalled();
  });

  it("renames a file and reports the new path so its tab can follow", async () => {
    renderExplorer();
    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "이름 변경" }));

    const field = await screen.findByLabelText("파일 이름");
    fireEvent.change(field, { target: { value: "guide.md" } });
    fireEvent.submit(field);

    await waitFor(() => expect(rename).toHaveBeenCalledWith(target, "readme.md", "guide.md"));
    await waitFor(() => expect(onEntryRenamed).toHaveBeenCalledWith("readme.md", "guide.md", "file"));
  });

  it("asks before trashing and reports the deletion", async () => {
    renderExplorer();
    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "삭제" }));

    const dialog = await screen.findByRole("dialog", { name: "휴지통으로 이동" });
    expect(trash).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "휴지통으로 이동" }));

    await waitFor(() => expect(trash).toHaveBeenCalledWith(target, "readme.md"));
    await waitFor(() => expect(onEntryDeleted).toHaveBeenCalledWith("readme.md", "file"));
  });

  it("counts what a folder holds and leaves it alone when the dialog is cancelled", async () => {
    renderExplorer();
    await openMenu("src");
    fireEvent.click(screen.getByRole("menuitem", { name: "삭제" }));

    const dialog = await screen.findByRole("dialog", { name: "휴지통으로 이동" });
    await waitFor(() => expect(within(dialog).getByText(/항목 1개/)).toBeInTheDocument());

    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trash).not.toHaveBeenCalled();
    expect(onEntryDeleted).not.toHaveBeenCalled();
  });

  it("shows what the main process refused", async () => {
    create.mockRejectedValue(new Error('"aux" is a name Windows reserves'));
    renderExplorer();
    await screen.findByText("readme.md");

    fireEvent.contextMenu(screen.getByRole("tree"), { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole("menuitem", { name: "새 폴더" }));
    const field = await screen.findByLabelText("폴더 이름");
    fireEvent.change(field, { target: { value: "aux" } });
    fireEvent.submit(field);

    expect(await screen.findByRole("alert")).toHaveTextContent("Windows reserves");
  });

  it("reveals and opens the entry through the shell", async () => {
    renderExplorer();
    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "탐색기에서 표시" }));
    await waitFor(() => expect(reveal).toHaveBeenCalledWith(target, "readme.md"));

    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "VS Code로 열기" }));
    await waitFor(() => expect(openInEditor).toHaveBeenCalledWith(target, "readme.md"));

    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "복제" }));
    await waitFor(() => expect(duplicate).toHaveBeenCalledWith(target, "readme.md"));
  });

  it("opens a file with its OS-associated program from the context menu", async () => {
    renderExplorer();
    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "연결 프로그램으로 열기" }));
    expect(onOpenFileExternal).toHaveBeenCalledWith(file);

    // Folders don't offer this item — the shell-open path only ever targets a single file.
    await openMenu("src");
    expect(screen.queryByRole("menuitem", { name: "연결 프로그램으로 열기" })).not.toBeInTheDocument();
  });

  it("opens a file in the app from the context menu", async () => {
    renderExplorer();
    await openMenu("readme.md");
    fireEvent.click(screen.getByRole("menuitem", { name: "앱에서 열기" }));
    expect(onOpenFileInApp).toHaveBeenCalledWith(file);
    expect(onOpenFile).not.toHaveBeenCalled();
  });
});

describe("FileExplorer opening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDirectory.mockImplementation(async (_target, relativePath: string) =>
      relativePath === "" ? [folder, file] : [nested],
    );
    changedPaths.mockResolvedValue({ agentPaths: [], baselineMs: 0 });
    panelData.mockResolvedValue(null);
    projectReveal.mockResolvedValue(undefined);
    worktreeReveal.mockResolvedValue(undefined);
    Object.assign(window, {
      multiCliWork: {
        workspaceFiles: { listDirectory, changedPaths, clearChanges },
        projects: { reveal: projectReveal },
        worktrees: { reveal: worktreeReveal },
        git: { panelData },
      },
    });
  });

  it("selects a file on a single click and opens it only on a double click or Enter", async () => {
    renderExplorer();
    const readme = await row("readme.md");

    fireEvent.click(readme);
    expect(onOpenFile).not.toHaveBeenCalled();
    expect(readme).toHaveClass("selected");

    fireEvent.doubleClick(readme);
    expect(onOpenFile).toHaveBeenCalledWith(file);

    fireEvent.keyDown(readme, { key: "Enter" });
    expect(onOpenFile).toHaveBeenCalledTimes(2);
  });

  it("still expands a folder on a single click", async () => {
    renderExplorer();
    fireEvent.click(await row("src"));
    expect(await row("main.ts")).toBeInTheDocument();
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it("opens the project or worktree folder in the system file manager from the header", async () => {
    const view = renderExplorer();
    fireEvent.click(await screen.findByRole("button", { name: "파일 탐색기에서 열기" }));
    await waitFor(() => expect(projectReveal).toHaveBeenCalledWith("p1"));

    view.unmount();
    renderExplorer({ kind: "worktree", id: "w1" } as never);
    fireEvent.click(await screen.findByRole("button", { name: "파일 탐색기에서 열기" }));
    await waitFor(() => expect(worktreeReveal).toHaveBeenCalledWith("w1"));
    expect(projectReveal).toHaveBeenCalledTimes(1);
  });
});

describe("FileExplorer change highlighting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDirectory.mockImplementation(async (_target, relativePath: string) =>
      relativePath === "" ? [folder, file] : [nested],
    );
    panelData.mockResolvedValue({
      isRepo: true, currentBranch: "main", upstream: null, ahead: null, behind: null,
      branches: ["main"], changes: [], ignored: [],
    });
    clearChanges.mockResolvedValue(undefined);
    Object.assign(window, {
      multiCliWork: {
        workspaceFiles: {
          listDirectory, absolutePath, reveal, openInEditor, create, rename, duplicate, trash,
          changedPaths, clearChanges,
        },
        git: { panelData },
        clipboard: { writeText },
      },
    });
  });

  it("colors an agent-edited file and rolls the mark up to its folder, leaving other rows alone", async () => {
    changedPaths.mockResolvedValue({ agentPaths: [{ relativePath: "src/main.ts", kind: "file", at: 1 }], baselineMs: 0 });
    renderExplorer();

    fireEvent.click(await row("src"));
    const mainRow = await row("main.ts");
    await waitFor(() => expect(mainRow.className).toContain("change-agent"));
    expect((await row("src")).className).toContain("change-below-agent");
    expect((await row("readme.md")).className).not.toMatch(/change-/);
  });

  it("clears the highlight through the '변경 표시 지우기' button", async () => {
    changedPaths.mockResolvedValue({ agentPaths: [{ relativePath: "readme.md", kind: "file", at: 1 }], baselineMs: 0 });
    renderExplorer();

    const readmeRow = await row("readme.md");
    await waitFor(() => expect(readmeRow.className).toContain("change-agent"));

    changedPaths.mockResolvedValue({ agentPaths: [], baselineMs: Date.now() });
    fireEvent.click(screen.getByRole("button", { name: "변경 표시 지우기" }));

    await waitFor(() => expect(clearChanges).toHaveBeenCalledWith(target));
    await waitFor(() => expect(readmeRow.className).not.toMatch(/change-/));
  });

  it("updates agent highlights without automatically refreshing the file list", async () => {
    changedPaths.mockResolvedValue({ agentPaths: [], baselineMs: 0 });
    renderExplorer();
    await row("readme.md");
    listDirectory.mockClear();
    changedPaths.mockClear();

    changedPaths.mockResolvedValue({ agentPaths: [{ relativePath: "readme.md", kind: "file", at: 2 }], baselineMs: 0 });
    listDirectory.mockResolvedValue([file, { ...file, name: "created.md", relativePath: "created.md" }]);
    fireEvent(window, new Event("mcw:agent-edits"));

    await waitFor(() => expect(changedPaths).toHaveBeenCalledWith(target));
    expect(screen.queryByText("created.md")).not.toBeInTheDocument();
    expect(listDirectory).not.toHaveBeenCalled();
  });
});

describe("FileExplorer directory request ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listDirectory.mockReset();
    panelData.mockResolvedValue({ isRepo: true, currentBranch: "main", upstream: null, ahead: null, behind: null, branches: ["main"], changes: [], ignored: [] });
    changedPaths.mockResolvedValue({ agentPaths: [], baselineMs: 0 });
    Object.assign(window, {
      multiCliWork: {
        workspaceFiles: { listDirectory, absolutePath, reveal, openInEditor, create, rename, duplicate, trash, changedPaths, clearChanges },
        git: { panelData }, clipboard: { writeText },
      },
    });
  });

  it("refreshes external additions, renames, edits and deletions on demand without collapsing the tree", async () => {
    listDirectory.mockImplementation(async (_target, dir) => dir === "" ? [folder, file] : [nested]);
    renderExplorer();
    fireEvent.click(await row("src"));
    fireEvent.click(await row("readme.md"));
    await row("main.ts");

    listDirectory.mockImplementation(async (_target, dir) => dir === ""
      ? [folder, { ...file, mtimeMs: 10 }, { ...file, name: "new.md", relativePath: "new.md" }]
      : [{ ...nested, name: "renamed.ts", relativePath: "src/renamed.ts" }]);
    fireEvent(window, new Event("mcw:files-refresh"));
    await screen.findByText("new.md");
    await screen.findByText("renamed.ts");

    expect(screen.getByText("new.md")).toBeInTheDocument();
    expect(screen.getByText("renamed.ts")).toBeInTheDocument();
    expect(screen.queryByText("main.ts")).not.toBeInTheDocument();
    expect(screen.getByText("readme.md").closest("button")).toHaveClass("selected", "change-local");
    expect(screen.queryByText("불러오는 중")).not.toBeInTheDocument();

    listDirectory.mockImplementation(async (_target, dir) => dir === "" ? [folder] : []);
    fireEvent.click(screen.getByRole("button", { name: "파일 목록 새로고침" }));
    await waitFor(() => expect(screen.queryByText("readme.md")).not.toBeInTheDocument());
    expect(screen.queryByText("new.md")).not.toBeInTheDocument();
    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
    expect(screen.getByText("비어 있음")).toBeInTheDocument();
  });

  it("does not poll or refresh on window focus while the tree is visible", async () => {
    vi.useFakeTimers();
    listDirectory.mockResolvedValue([file]);
    renderExplorer();
    await act(async () => {});
    listDirectory.mockClear();
    listDirectory.mockResolvedValue([{ ...file, name: "external.md", relativePath: "external.md" }]);
    fireEvent(window, new Event("focus"));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(listDirectory).not.toHaveBeenCalled();
    expect(screen.queryByText("external.md")).not.toBeInTheDocument();
  });

  it("keeps the last listing while a refresh is pending and retries a failed refresh", async () => {
    listDirectory.mockResolvedValue([file]);
    renderExplorer();
    await row("readme.md");
    const pending = deferred<FileTreeEntry[]>();
    fireEvent.contextMenu(screen.getByRole("tree"), { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole("menuitem", { name: "새 파일" }));
    fireEvent.change(screen.getByLabelText("파일 이름"), { target: { value: "draft.md" } });
    listDirectory.mockClear();
    listDirectory.mockReturnValueOnce(pending.promise);
    fireEvent(window, new Event("mcw:files-refresh"));
    expect(listDirectory).toHaveBeenCalledTimes(1);
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    await act(async () => pending.reject(new Error("temporary failure")));
    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(screen.getByLabelText("파일 이름")).toHaveValue("draft.md");
    expect(screen.getByRole("alert")).toHaveTextContent("temporary failure");
    listDirectory.mockResolvedValue([{ ...file, name: "recovered.md", relativePath: "recovered.md" }]);
    fireEvent(window, new Event("mcw:files-refresh"));
    expect(await screen.findByText("recovered.md")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("updates Git marks when expanding a directory reveals an external edit", async () => {
    listDirectory.mockImplementation(async (_target, dir) => dir === "" ? [folder] : [nested]);
    renderExplorer();
    fireEvent.click(await row("src"));
    await row("main.ts");
    fireEvent.click(await row("src"));
    listDirectory.mockImplementation(async (_target, dir) => dir === "" ? [folder] : [{ ...nested, mtimeMs: 20 }]);
    panelData.mockResolvedValue({ isRepo: true, currentBranch: "main", branches: ["main"], changes: [{ path: "src/main.ts", status: "M" }], ignored: [] });
    fireEvent.click(await row("src"));
    await waitFor(() => expect(screen.getByText("main.ts").closest("button")).toHaveClass("git-modified"));
  });

  it("ignores a directory success from the previously selected target", async () => {
    const oldRead = deferred<FileTreeEntry[]>();
    const nextTarget = { kind: "project", id: "p2" } as const;
    listDirectory.mockImplementation((readTarget) => readTarget.id === target.id ? oldRead.promise : Promise.resolve([{ ...file, name: "new.md", relativePath: "new.md" }]));
    const view = renderExplorer();

    view.rerender(<FileExplorer hidden={false} target={nextTarget} targetLabel="Next" selectedRelativePath={null} vscodeAvailable onOpenFile={onOpenFile} onOpenFileInApp={onOpenFileInApp} onOpenFileExternal={onOpenFileExternal} onEntryDeleted={onEntryDeleted} onEntryRenamed={onEntryRenamed} />);
    await screen.findByText("new.md");
    await act(async () => oldRead.resolve([file]));

    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
  });

  it("does not revive an old target request after switching A to B and back to A", async () => {
    const oldA = deferred<FileTreeEntry[]>();
    const newA = deferred<FileTreeEntry[]>();
    const targetB = { kind: "project", id: "p2" } as const;
    let aReads = 0;
    listDirectory.mockImplementation((readTarget) => {
      if (readTarget.id === targetB.id) return Promise.resolve([{ ...file, name: "b.md", relativePath: "b.md" }]);
      aReads += 1;
      return aReads === 1 ? oldA.promise : newA.promise;
    });
    const props = { hidden: false, targetLabel: "Repo", selectedRelativePath: null, vscodeAvailable: true, onOpenFile, onOpenFileInApp, onOpenFileExternal, onEntryDeleted, onEntryRenamed };
    const view = render(<FileExplorer {...props} target={target} />);
    view.rerender(<FileExplorer {...props} target={targetB} />);
    await screen.findByText("b.md");
    view.rerender(<FileExplorer {...props} target={target} />);
    await act(async () => newA.resolve([{ ...file, name: "current.md", relativePath: "current.md" }]));
    await screen.findByText("current.md");

    await act(async () => oldA.resolve([file]));

    expect(screen.getByText("current.md")).toBeInTheDocument();
    expect(screen.queryByText("readme.md")).not.toBeInTheDocument();
  });

  it("ignores an older failure after a newer refresh succeeds for the same directory", async () => {
    const oldRead = deferred<FileTreeEntry[]>();
    listDirectory.mockReturnValueOnce(oldRead.promise).mockResolvedValue([file]);
    renderExplorer();
    fireEvent.click(screen.getByRole("button", { name: "파일 목록 새로고침" }));
    await screen.findByText("readme.md");

    await act(async () => oldRead.reject(new Error("stale failure")));

    expect(screen.getByText("readme.md")).toBeInTheDocument();
    expect(screen.queryByText("불러오지 못했습니다")).not.toBeInTheDocument();
  });

  it("does not let a completed mutation from the previous target invalidate the current root read", async () => {
    const created = deferred<string>();
    const targetBRead = deferred<FileTreeEntry[]>();
    const targetB = { kind: "project", id: "p2" } as const;
    listDirectory.mockImplementation((readTarget) =>
      readTarget.id === targetB.id ? targetBRead.promise : Promise.resolve([file]),
    );
    create.mockReturnValue(created.promise);
    const props = { hidden: false, targetLabel: "Repo", selectedRelativePath: null, vscodeAvailable: true, onOpenFile, onOpenFileInApp, onOpenFileExternal, onEntryDeleted, onEntryRenamed };
    const view = render(<FileExplorer {...props} target={target} />);
    await screen.findByText("readme.md");
    fireEvent.contextMenu(screen.getByRole("tree"), { clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole("menuitem", { name: "새 파일" }));
    const field = await screen.findByLabelText("파일 이름");
    fireEvent.change(field, { target: { value: "late.md" } });
    fireEvent.submit(field);
    await waitFor(() => expect(create).toHaveBeenCalledWith(target, "", "late.md", "file"));

    view.rerender(<FileExplorer {...props} target={targetB} />);
    await waitFor(() => expect(listDirectory).toHaveBeenCalledWith(targetB, ""));
    await act(async () => created.resolve("late.md"));
    await act(async () => targetBRead.resolve([{ ...file, name: "b.md", relativePath: "b.md" }]));

    expect(await screen.findByText("b.md")).toBeInTheDocument();
    expect(screen.queryByText("불러오는 중")).not.toBeInTheDocument();
  });
});
