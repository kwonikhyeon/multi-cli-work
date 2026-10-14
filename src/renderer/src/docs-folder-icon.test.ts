import { describe, expect, it } from "vitest";
import { docsFolderKind } from "./docs-folder-icon";

describe("docsFolderKind", () => {
  it("Google Drive 내 드라이브·My Drive 아래는 drive다", () => {
    expect(docsFolderKind("G:/내 드라이브/R_DOTORI")).toBe("drive");
    expect(docsFolderKind("H:/My Drive/S_커리어/2026")).toBe("drive");
    expect(docsFolderKind("C:/Users/u/My Drive")).toBe("drive");
  });

  it("OneDrive·Teams 동기화 폴더는 teams다", () => {
    expect(docsFolderKind("C:/Users/u/노바테크/수행프로젝트(기술연구소) - 문서/R_DOTORI")).toBe("teams");
    expect(docsFolderKind("C:/Users/u/OneDrive - 노바테크/문서")).toBe("teams");
  });

  it("그 밖은 일반 문서 폴더다", () => {
    expect(docsFolderKind("C:/work/projects/PRJ-0017-secondbrain")).toBe("folder");
    expect(docsFolderKind("G:/내 드라이브백업/x")).toBe("folder");
  });
});
