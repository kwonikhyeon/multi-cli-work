/**
 * PC 사이를 오가는 논리 경로 — 같은 레포가 이 PC에서는 `C:\dev\x`, 회사 노트북에서는 `D:\dev\x`다.
 * 프로필에는 `dev/x`로 적고, 불러오는 PC의 루트로 다시 푼다. 접두는 ws-root 매핑표와 같은
 * `dev/` `data/` `work/` `drive/`에 사용자 홈 `home/`을 더했다.
 *
 * 렌더러에서도 쓰므로 node `path` 없이 문자열만으로 처리한다. Windows 경로는 대소문자를 가리지
 * 않고, 한글·공백·괄호는 그대로 둔다.
 */
export const LOGICAL_ROOT_KEYS = ["dev", "data", "work", "drive", "home"] as const;
export type LogicalRootKey = (typeof LOGICAL_ROOT_KEYS)[number];
export type LogicalRoots = Record<LogicalRootKey, string | null>;

function trimSeparators(value: string): string {
  return value.replace(/[\\/]+$/, "");
}

function comparable(value: string): string {
  return trimSeparators(value.replace(/\\/g, "/")).toLowerCase();
}

/**
 * `abs`가 어느 루트 아래에 있으면 그 루트의 논리 경로, 아니면 null. 루트가 겹치면(드라이브가 홈
 * 아래 등) 가장 긴 루트를 고른다.
 */
export function toLogicalPath(abs: string, roots: LogicalRoots): string | null {
  const target = comparable(abs);
  let best: { key: LogicalRootKey; length: number } | null = null;
  for (const key of LOGICAL_ROOT_KEYS) {
    const root = roots[key];
    if (root === null || root.trim().length === 0) continue;
    const base = comparable(root);
    if (target !== base && !target.startsWith(`${base}/`)) continue;
    if (best === null || base.length > best.length) best = { key, length: base.length };
  }
  if (best === null) return null;
  const rest = trimSeparators(abs.replace(/\\/g, "/")).slice(best.length).replace(/^\/+/, "");
  return rest.length > 0 ? `${best.key}/${rest}` : best.key;
}

/** 논리 경로를 이 PC의 절대경로로. 루트가 없거나 형식이 틀리면 null — 다른 루트로 떨어뜨리지 않는다. */
export function fromLogicalPath(logical: string, roots: LogicalRoots): string | null {
  const segments = logical
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.includes("..")) return null;
  const [head, ...rest] = segments;
  if (!(LOGICAL_ROOT_KEYS as readonly string[]).includes(head!)) return null;
  const root = roots[head as LogicalRootKey];
  if (root === null || root.trim().length === 0) return null;
  const separator = root.includes("\\") || /^[A-Za-z]:/.test(root) ? "\\" : "/";
  const base = trimSeparators(root);
  return rest.length > 0 ? `${base}${separator}${rest.join(separator)}` : base;
}

/** 경로가 `root` 자체이거나 그 아래인지 — 대소문자·구분자 차이를 무시한다. */
export function isUnderRoot(abs: string, root: string | null): boolean {
  if (root === null || root.trim().length === 0) return false;
  const target = comparable(abs);
  const base = comparable(root);
  return target === base || target.startsWith(`${base}/`);
}
