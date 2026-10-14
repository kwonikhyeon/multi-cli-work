import type { WorkProject } from "@shared/work-project-types";
import { describe, expect, it } from "vitest";
import { reorderWorkProjects, sortWorkProjects } from "./work-project-order";

const CATEGORIES = [
  { name: "정부과제", color: 1, code: "G" },
  { name: "연구개발", color: 3, code: "R" },
  { name: "우리", color: 5, code: "U" },
];

function wp(id: string, category: string, createdAt: string, order: number | null = null): WorkProject {
  return {
    id,
    name: id,
    category,
    status: null,
    memo: "",
    notionLinks: [],
    localFolders: [],
    members: [],
    order,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("sortWorkProjects", () => {
  it("구분 순서가 먼저고, 구분 안에서는 만든 순서다", () => {
    const sorted = sortWorkProjects(
      [
        wp("wedding", "우리", "2026-08-11"),
        wp("vibe", "연구개발", "2026-10-14"),
        wp("dotori", "연구개발", "2026-10-12"),
        wp("grant", "정부과제", "2026-10-14"),
        wp("odd", "없는구분", "2026-01-01"),
      ],
      CATEGORIES,
    );
    expect(sorted.map((workProject) => workProject.id)).toEqual(["grant", "dotori", "vibe", "wedding", "odd"]);
  });

  it("손으로 정한 순서가 만든 순서를 이기지만 구분은 넘지 못한다", () => {
    const sorted = sortWorkProjects(
      [wp("dotori", "연구개발", "2026-10-12", 5), wp("vibe", "연구개발", "2026-10-14", 1), wp("grant", "정부과제", "2026-10-14", 9)],
      CATEGORIES,
    );
    expect(sorted.map((workProject) => workProject.id)).toEqual(["grant", "vibe", "dotori"]);
  });
});

describe("reorderWorkProjects", () => {
  const sorted = sortWorkProjects(
    [wp("grant", "정부과제", "1"), wp("dotori", "연구개발", "2"), wp("vibe", "연구개발", "3"), wp("wedding", "우리", "4")],
    CATEGORIES,
  );

  it("같은 구분 안에서 옮기면 전체 순서를 돌려준다", () => {
    expect(reorderWorkProjects(sorted, "vibe", "dotori", "before")).toEqual(["grant", "vibe", "dotori", "wedding"]);
  });

  it("다른 구분 자리나 제자리로는 옮기지 않는다", () => {
    expect(reorderWorkProjects(sorted, "vibe", "grant", "before")).toBeNull();
    expect(reorderWorkProjects(sorted, "vibe", "dotori", "after")).toBeNull();
  });
});
