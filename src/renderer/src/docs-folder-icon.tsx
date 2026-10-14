import { BookOpen } from "lucide-react";
import { GoogleDriveIcon, TeamsIcon } from "./brand-icons";

export type DocsFolderKind = "drive" | "teams" | "folder";

/**
 * 문서 폴더가 어디에 사는지 경로만 보고 고른다 — 사이드바가 PC 루트 설정을 몰라도 같은 답을 내도록.
 * Google Drive for desktop은 어느 PC에서나 `…\내 드라이브\` 또는 `…\My Drive\`로 보이고, Teams
 * 문서는 OneDrive 동기화 폴더(`…\노바테크\수행프로젝트…`, `OneDrive - …`) 아래에 있었다.
 */
export function docsFolderKind(rootPath: string): DocsFolderKind {
  if (/[\\/](내 드라이브|My Drive)([\\/]|$)/i.test(rootPath)) return "drive";
  if (/onedrive|sharepoint|teams|수행프로젝트/i.test(rootPath)) return "teams";
  return "folder";
}

export function DocsFolderIcon({ rootPath, size = 14 }: { rootPath: string; size?: number }) {
  const kind = docsFolderKind(rootPath);
  if (kind === "drive") return <GoogleDriveIcon size={size} className="brand-icon-gdrive" />;
  if (kind === "teams") return <TeamsIcon size={size} className="brand-icon-teams" />;
  return <BookOpen size={size} className="brand-icon-docs" aria-hidden="true" />;
}
