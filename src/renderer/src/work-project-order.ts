import type { ProjectCategorySetting } from "@shared/settings-types";
import type { WorkProject } from "@shared/work-project-types";
import { reorderIds, type DropPosition } from "./project-order";

/**
 * 사이드바의 업무 프로젝트 순서: 구분(설정의 구분 목록 순서) → 손으로 정한 순서 → 만든 순서.
 * 손으로 정한 순서가 없는 항목은 그 구분 안에서 먼저 만든 것이 위다. 목록에 없는 구분은 맨 뒤에 모인다.
 */
export function sortWorkProjects(
  workProjects: readonly WorkProject[],
  categories: readonly ProjectCategorySetting[],
): WorkProject[] {
  const rank = new Map(categories.map((category, index) => [category.name, index]));
  const categoryRank = (workProject: WorkProject) => rank.get(workProject.category) ?? categories.length;
  return [...workProjects].sort(
    (left, right) =>
      categoryRank(left) - categoryRank(right) ||
      (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.name.localeCompare(right.name),
  );
}

/**
 * 드래그로 옮긴 뒤의 전체 순서. 구분이 다른 자리로는 옮기지 않는다 — 구분이 1순위라 그 자리는
 * 어차피 지켜지지 않는다(구분을 바꾸려면 상세 페이지에서). 바뀌는 것이 없으면 null.
 */
export function reorderWorkProjects(
  sorted: readonly WorkProject[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): string[] | null {
  const dragged = sorted.find((workProject) => workProject.id === draggedId);
  const target = sorted.find((workProject) => workProject.id === targetId);
  if (!dragged || !target || dragged.category !== target.category) return null;
  const ids = sorted.map((workProject) => workProject.id);
  const next = reorderIds(ids, draggedId, targetId, position);
  return next.some((id, index) => id !== ids[index]) ? next : null;
}
