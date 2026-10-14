import { describe, expect, it } from "vitest";
import {
  categoryForCode,
  parsePrefixedName,
  prefixMismatch,
  sortCategoriesByCode,
  withCategoryPrefix,
} from "./category-code";
import type { ProjectCategorySetting } from "./settings-types";

const CATEGORIES: ProjectCategorySetting[] = [
  { name: "정부과제", color: 1, code: "G" },
  { name: "외주용역", color: 2, code: "O" },
  { name: "연구개발", color: 3, code: "R" },
  { name: "개인", color: 4, code: "S" },
  { name: "우리", color: 5, code: "U" },
  { name: "기타", color: 6, code: "Z" },
];

describe("parsePrefixedName", () => {
  it("대문자 한 글자 + 밑줄 접두어를 읽는다", () => {
    expect(parsePrefixedName("R_DOTORI")).toEqual({ code: "R", rest: "DOTORI" });
    expect(parsePrefixedName("U_결혼식")).toEqual({ code: "U", rest: "결혼식" });
    expect(parsePrefixedName("O_삼성서울병원 2차")).toEqual({ code: "O", rest: "삼성서울병원 2차" });
  });

  it("접두어가 아닌 이름은 null이다", () => {
    expect(parsePrefixedName("_archive")).toBeNull();
    expect(parsePrefixedName("share")).toBeNull();
    expect(parsePrefixedName("r_소문자")).toBeNull();
    expect(parsePrefixedName("RR_두글자")).toBeNull();
    expect(parsePrefixedName("R_")).toBeNull();
  });
});

describe("구분과 이름", () => {
  it("코드로 구분을 찾는다", () => {
    expect(categoryForCode(CATEGORIES, "S")?.name).toBe("개인");
    expect(categoryForCode(CATEGORIES, "P")).toBeUndefined();
  });

  it("구분을 바꾸면 접두어를 갈아 끼우고, 코드 없는 구분은 이름을 그대로 둔다", () => {
    expect(withCategoryPrefix("P_커리어", CATEGORIES[3])).toBe("S_커리어");
    expect(withCategoryPrefix("바이브코딩", CATEGORIES[2])).toBe("R_바이브코딩");
    expect(withCategoryPrefix("P_커리어", { name: "업무", color: 1 })).toBe("P_커리어");
  });

  it("접두어가 구분 코드와 어긋나는지 본다", () => {
    expect(prefixMismatch("F_결혼식", CATEGORIES[4])).toBe(true);
    expect(prefixMismatch("U_결혼식", CATEGORIES[4])).toBe(false);
    expect(prefixMismatch("결혼식", CATEGORIES[4])).toBe(true);
    expect(prefixMismatch("결혼식", { name: "업무", color: 1 })).toBe(false);
  });

  it("코드 알파벳순으로 정렬하고 코드 없는 구분은 순서를 지켜 뒤에 둔다", () => {
    const shuffled: ProjectCategorySetting[] = [
      { name: "미분류", color: 1 },
      CATEGORIES[5]!,
      CATEGORIES[0]!,
      { name: "보류", color: 2 },
      CATEGORIES[3]!,
    ];
    expect(sortCategoriesByCode(shuffled).map((category) => category.name)).toEqual([
      "정부과제",
      "개인",
      "기타",
      "미분류",
      "보류",
    ]);
  });
});
