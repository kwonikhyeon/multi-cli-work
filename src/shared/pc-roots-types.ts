import type { PcRootsSettings } from "./settings-types";

/** 설정 화면이 보여 주는 루트 세 겹 — 지정값, 탐지값, 실제로 쓰는 값(지정값이 이긴다). */
export interface PcRootsInfo {
  configured: PcRootsSettings;
  detected: PcRootsSettings;
  effective: PcRootsSettings;
  /** 사용자 홈 — 논리 경로 `home/`의 기준. */
  home: string;
}
