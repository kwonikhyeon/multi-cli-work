/**
 * Google Drive "내 드라이브" 연동. 업무 프로젝트 하나가 드라이브 최상위 폴더 하나에 대응한다 —
 * 이름이 같으면 연결된 것이다(`R_DOTORI` ↔ `<drive>\R_DOTORI`). 그래서 `work-projects.json`에
 * 새 필드가 없다: 엄격 파서가 있는 그 파일을 건드리지 않아야 구버전으로 내려가도 안전하다.
 */

/** 드라이브 루트 README가 정한 업무 프로젝트 폴더 템플릿(`G_ O_ R_ Z_` 공통). */
export const DRIVE_TEMPLATE_FOLDERS = [
  "1. 연구개발계획서",
  "2. 발표자료",
  "3. 개발",
  "4. 사진동영상 등",
  "5. 참고논문 등",
  "6. 기타자료",
  "7. 산출물",
  "Data",
  "tmp",
] as const;

/** 드라이브 최상위의 `<코드>_<이름>` 폴더 하나. */
export interface DriveFolderEntry {
  name: string;
  code: string;
  /** 코드에 해당하는 구분 이름. 설정에 그 코드가 없으면 null. */
  category: string | null;
  /** 같은 이름의 업무 프로젝트. 없으면 "드라이브에서 가져오기" 대상이다. */
  workProjectId: string | null;
}

export interface DriveOverview {
  /** 이 PC의 드라이브 루트. 설정도 탐지도 없으면 null. */
  root: string | null;
  /** 루트가 있고 실제로 열리는지. */
  available: boolean;
  folders: DriveFolderEntry[];
}

/** 드라이브 밖(Teams·OneDrive·사라진 경로)을 가리키는 문서 폴더와 옮겨 갈 드라이브 경로. */
export interface DriveLegacyDocs {
  projectId: string;
  rootPath: string;
  /** 드라이브에 같은 이름 폴더가 있으면 그 경로. 없으면 null — 직접 옮겨야 한다. */
  suggestedPath: string | null;
  /** 지금 경로가 실제로 열리는지. */
  exists: boolean;
}

export interface DriveProjectStatus {
  root: string | null;
  /** `<root>\<업무 프로젝트 이름>`. 루트가 없으면 null. */
  folderPath: string | null;
  exists: boolean;
  /** 폴더 바로 아래 하위 폴더(숨김 제외, 이름순). 바로가기 칩으로 쓴다. */
  subfolders: { name: string; path: string }[];
  /** 이 폴더를 문서 폴더로 등록한 멤버(폴더 프로젝트 id). 없으면 아직 연결하지 않은 것. */
  linkedProjectId: string | null;
  legacyDocs: DriveLegacyDocs[];
}

export interface DriveCreateOptions {
  /** README 템플릿 폴더(1.~7., Data, tmp)와 CLAUDE.md를 같이 만든다. */
  template: boolean;
}
