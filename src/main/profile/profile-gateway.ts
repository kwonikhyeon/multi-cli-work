import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ProfileExportResult,
  ProfileImportPreview,
  ProfileImportResult,
  MultiCliWorkProfileV1,
} from "../../shared/profile-types";
import {
  applyProfileImport,
  buildProfile,
  parseProfile,
  previewProfileImport,
  type ProfileDependencies,
} from "./profile-service";

export interface ProfileGateway {
  /** `<drive>\_config\multi-cli-work\profile.json`. 드라이브 루트가 없으면 null. */
  defaultPath(): string | null;
  /** 저장 위치를 묻고 내보낸다. 취소하면 null. */
  exportProfile(): Promise<ProfileExportResult | null>;
  /** 파일을 고르게 하고 무엇이 바뀔지 돌려준다. 취소하면 null. */
  previewImport(): Promise<ProfileImportPreview | null>;
  /** 마지막으로 미리 본 파일을 적용한다 — 렌더러가 임의 경로를 넘기지 못하게 경로를 받지 않는다. */
  applyImport(): Promise<ProfileImportResult>;
}

export interface ProfileGatewayOptions {
  deps: ProfileDependencies;
  driveRoot(): string | null;
  fallbackDir(): string;
  chooseSavePath(defaultPath: string): Promise<string | null>;
  chooseOpenPath(defaultPath: string): Promise<string | null>;
  /** 적용이 끝난 뒤 — 렌더러에 폴더·업무 프로젝트를 다시 읽으라고 알린다. */
  onImported(): void;
}

export const PROFILE_FILE_NAME = "profile.json";

export function createProfileGateway(options: ProfileGatewayOptions): ProfileGateway {
  let previewed: string | null = null;
  const defaultPath = () => {
    const drive = options.driveRoot();
    return drive === null ? null : path.join(drive, "_config", "multi-cli-work", PROFILE_FILE_NAME);
  };
  const readProfile = async (filePath: string): Promise<MultiCliWorkProfileV1> => {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      throw new Error(`프로필을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
    return parseProfile(raw);
  };

  return {
    defaultPath,
    async exportProfile() {
      const target = await options.chooseSavePath(defaultPath() ?? path.join(options.fallbackDir(), PROFILE_FILE_NAME));
      if (!target) return null;
      const profile = await buildProfile(options.deps);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
      return { path: target, folderCount: profile.folderProjects.length, workProjectCount: profile.workProjects.length };
    },
    async previewImport() {
      const source = await options.chooseOpenPath(defaultPath() ?? options.fallbackDir());
      if (!source) return null;
      const preview = await previewProfileImport(source, await readProfile(source), options.deps);
      previewed = source;
      return preview;
    },
    async applyImport() {
      if (previewed === null) throw new Error("먼저 불러올 프로필을 골라 미리 보세요");
      const source = previewed;
      previewed = null;
      // 미리 본 뒤 드라이브 동기화로 파일이 바뀌었을 수 있다 — 적용 직전에 다시 읽는다.
      const result = await applyProfileImport(await readProfile(source), options.deps);
      options.onImported();
      return result;
    },
  };
}
