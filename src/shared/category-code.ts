import { CATEGORY_CODE_PATTERN, type ProjectCategorySetting } from "./settings-types";

/**
 * 구분 코드 접두어 규칙 — 업무 프로젝트 이름과 드라이브 최상위 폴더 이름이 `<코드>_<이름>`
 * (`R_DOTORI`, `U_결혼식`)이다. 코드 문자를 구분 순서대로 고르면 알파벳순 정렬이 곧 구분 순서다.
 */
const PREFIXED_NAME_PATTERN = /^([A-Z])_(.+)$/;

export interface PrefixedName {
  code: string;
  rest: string;
}

export function parsePrefixedName(name: string): PrefixedName | null {
  const match = PREFIXED_NAME_PATTERN.exec(name.trim());
  if (match === null) return null;
  const rest = match[2]!.trim();
  return rest.length > 0 ? { code: match[1]!, rest } : null;
}

export function categoryForCode(
  categories: readonly ProjectCategorySetting[],
  code: string,
): ProjectCategorySetting | undefined {
  return categories.find((category) => category.code === code);
}

export function isCategoryCode(value: string): boolean {
  return CATEGORY_CODE_PATTERN.test(value);
}

/**
 * 구분에 맞는 이름 — 코드가 없는 구분이면 이름을 그대로 두고, 있으면 기존 접두어(다른 구분의 것이라도)를
 * 떼고 새 코드를 붙인다.
 */
export function withCategoryPrefix(name: string, category: ProjectCategorySetting | undefined): string {
  const trimmed = name.trim();
  if (category?.code === undefined) return trimmed;
  const rest = parsePrefixedName(trimmed)?.rest ?? trimmed;
  return rest.length > 0 ? `${category.code}_${rest}` : `${category.code}_`;
}

/** 이름 접두어가 구분 코드와 어긋나는지. 코드 없는 구분은 접두어 규칙이 없으니 항상 false. */
export function prefixMismatch(name: string, category: ProjectCategorySetting | undefined): boolean {
  if (category?.code === undefined) return false;
  return parsePrefixedName(name)?.code !== category.code;
}

/** 코드 알파벳순 — 코드 없는 구분은 원래 순서를 지킨 채 뒤로 간다. */
export function sortCategoriesByCode(categories: readonly ProjectCategorySetting[]): ProjectCategorySetting[] {
  return categories
    .map((category, index) => ({ category, index }))
    .sort((a, b) => {
      const left = a.category.code;
      const right = b.category.code;
      if (left !== undefined && right !== undefined) return left < right ? -1 : left > right ? 1 : 0;
      if (left !== undefined) return -1;
      if (right !== undefined) return 1;
      return a.index - b.index;
    })
    .map(({ category }) => category);
}
