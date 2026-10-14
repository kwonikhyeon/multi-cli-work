import { describe, expect, it } from "vitest";
import { fromLogicalPath, isUnderRoot, toLogicalPath, type LogicalRoots } from "./logical-path";

const HOME_PC: LogicalRoots = {
  dev: "C:\\dev",
  data: "C:\\data",
  work: "C:\\work",
  drive: "G:\\내 드라이브",
  home: "C:\\Users\\uiop3",
};
const LAB_PC: LogicalRoots = {
  dev: "D:\\dev",
  data: "D:\\data",
  work: "D:\\work",
  drive: "G:\\내 드라이브",
  home: "C:\\Users\\jinmin",
};

describe("논리 경로", () => {
  it("루트 아래 경로를 접두 논리 경로로 바꾸고 다른 PC의 루트로 다시 푼다", () => {
    const logical = toLogicalPath("C:\\dev\\multi-cli-work", HOME_PC);
    expect(logical).toBe("dev/multi-cli-work");
    expect(fromLogicalPath(logical!, LAB_PC)).toBe("D:\\dev\\multi-cli-work");
  });

  it("한글·공백·괄호를 보존하고 대소문자·끝 구분자 차이를 무시한다", () => {
    const logical = toLogicalPath("g:/내 드라이브/R_DOTORI/3. 개발 (HW)/", HOME_PC);
    expect(logical).toBe("drive/R_DOTORI/3. 개발 (HW)");
    expect(fromLogicalPath(logical!, LAB_PC)).toBe("G:\\내 드라이브\\R_DOTORI\\3. 개발 (HW)");
  });

  it("루트 자체는 접두만 남는다", () => {
    expect(toLogicalPath("C:\\data", HOME_PC)).toBe("data");
    expect(fromLogicalPath("data", LAB_PC)).toBe("D:\\data");
  });

  it("이름만 비슷한 형제 폴더는 루트 아래로 보지 않는다", () => {
    expect(toLogicalPath("C:\\develop\\x", HOME_PC)).toBeNull();
    expect(isUnderRoot("C:\\develop\\x", "C:\\dev")).toBe(false);
    expect(isUnderRoot("c:\\DEV\\x", "C:\\dev\\")).toBe(true);
  });

  it("어느 루트에도 없으면 null이고, 루트가 겹치면 긴 쪽을 고른다", () => {
    expect(toLogicalPath("C:\\NeuroPilot\\neuropilot_develop", HOME_PC)).toBeNull();
    const nested: LogicalRoots = { ...HOME_PC, drive: "C:\\Users\\uiop3\\Google Drive" };
    expect(toLogicalPath("C:\\Users\\uiop3\\Google Drive\\S_기타", nested)).toBe("drive/S_기타");
    expect(toLogicalPath("C:\\Users\\uiop3\\Downloads", nested)).toBe("home/Downloads");
  });

  it("풀 수 없는 논리 경로는 null이다 — 없는 루트, 모르는 접두, 상위 탈출", () => {
    expect(fromLogicalPath("drive/R_DOTORI", { ...LAB_PC, drive: null })).toBeNull();
    expect(fromLogicalPath("onedrive/x", LAB_PC)).toBeNull();
    expect(fromLogicalPath("dev/../secret", LAB_PC)).toBeNull();
    expect(fromLogicalPath("", LAB_PC)).toBeNull();
  });

  it("POSIX 루트는 슬래시로 푼다", () => {
    const linux: LogicalRoots = { dev: "/home/u/dev", data: null, work: null, drive: null, home: "/home/u" };
    expect(toLogicalPath("/home/u/dev/app", linux)).toBe("dev/app");
    expect(fromLogicalPath("dev/app", linux)).toBe("/home/u/dev/app");
  });
});
