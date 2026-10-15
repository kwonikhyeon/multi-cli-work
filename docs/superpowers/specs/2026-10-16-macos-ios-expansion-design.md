# macOS·iOS 확장 설계

> 상태: 설계 확정 (2026-10-16 인터뷰) · 구현 전
> 범위: 데스크톱 앱에 macOS(Apple Silicon)를 3번째 1급 플랫폼으로 추가하고, iPhone에서는 기존 모바일 웹 UI를 Safari(홈 화면)로 쓸 수 있게 다듬는다.

## 1. 목적과 전제

지금 작업 머신이 Mac(arm64, macOS 26)이므로 **macOS 데스크톱을 먼저** 완성해 바로 쓰면서 검증하고, 완성된 Mac 호스트에 **iPhone이 웹으로 붙는다.** iOS 네이티브 셸은 이번 범위가 아니다.

전제 (인터뷰 결정):

- **배포는 우선 개인용**, 나중에 공개(GitHub 릴리스)로 확장할 수 있게 설계한다. 지금 공개 배포를 막는 결정은 하지 않는다.
- **Apple Developer Program은 무료 계정으로 시작**한다. 따라서 Developer ID 서명·공증이 없고, macOS 자동 업데이트(electron-updater)는 서명 필수라 **개인용 단계에서는 끈다.**
- iPhone은 **Tailscale**로 같은 tailnet에 있고, 호스트가 서빙하는 `/mobile/` 웹 UI를 Safari로 연다. 모바일 웹 UI는 이미 브라우저 폴백(코드 입력 페어링 + localStorage 토큰, `shell-bridge.ts`가 브리지 부재 시 null)을 갖추고 있다.
- 구현 순서: **macOS 먼저 → iPhone 웹**.

## 2. 결정 요약

| 항목 | 결정 | 버린 대안 |
|---|---|---|
| macOS 데스크톱 | 기존 Electron 앱에 darwin 분기 추가 | 네이티브(Swift) 재작성 — 세션 엔진·git·원격 서버 전부 재구현이라 비현실적 |
| iOS | 기존 모바일 웹 UI를 Safari/홈 화면으로 사용 (앱 없음) | SwiftUI 네이티브 셸(Android 대칭) — 무료 계정 7일 재서명 부담, 추후 별도 스펙으로; React Native 재구축 — 웹 서빙 모델 장점 상실 |
| macOS 자동 업데이트 | 개인용 단계에서 비활성, 수동 안내(기존 `릴리스` 링크 폴백 UI) | 무서명 자동 업데이트 — electron-updater가 macOS에서 지원하지 않음 |
| macOS 서명 | ad-hoc(`identity: null`), Gatekeeper는 우클릭-열기로 통과 | Developer ID 서명+공증 — 유료 계정 필요, 공개 단계로 연기 |
| 대상 아키텍처 | arm64 전용 | universal/Intel — 보유 기기가 Apple Silicon뿐, 공개 단계에서 재검토 |
| iPhone 알림 | 없음 (범위 밖) | APNs — 무료 계정 불가; 웹 푸시 — HTTPS(tailscale cert) 구성 필요, 보류 |
| CI macOS 러너 | 공개 단계로 연기, 1차는 로컬 검증 | 즉시 3-OS 매트릭스 — 개인용 단계 유지비 과다 |

## 3. macOS 포팅 설계

비(非)Windows 경로가 POSIX 기준이라 대부분 그대로 동작한다(`win32` 분기 129곳 vs `darwin` 분기 0곳 — 즉 darwin은 현재 Linux로 취급된다). darwin 분기가 실제로 필요한 지점만 추가한다.

### 3.1 창 크롬 — `src/main/window-chrome.ts`

현재 darwin은 non-Windows 분기(`frame: false`)로 떨어져 신호등 버튼이 사라진다(파일 주석에 명시됨).

- darwin: `{ titleBarStyle: "hiddenInset" }` 로 교체, 필요 시 `trafficLightPosition` 조정.
- 렌더러 커스텀 타이틀바: darwin에서 좌측 신호등 영역만큼 여백을 주고, 커스텀 최소화·최대화·닫기 버튼은 숨긴다(OS 제공).
- `window-chrome.test.ts`의 darwin 기대값을 갱신한다.

### 3.2 내장 셸 — `src/main/agents/builtin-agents.ts`

- **zsh**(macOS 기본 로그인 셸)를 내장 에이전트로 추가: `commands: ["zsh"]`, `args: ["--login"]`, `statusAdapter: "signals"` — bash 정의와 동형.
- darwin에서 zsh(기본)+bash를 노출한다. 내장 셸의 OS별 노출 규칙이 걸리는 지점(agent registry/provider availability — 구현 시 확인)에 darwin 분기를 더한다. PowerShell은 기존 가용성 검사(`pwsh` 미설치 → 비활성)로 자연히 처리된다.
- Claude·Codex 탐지는 로그인 셸 PATH 탐지(`platform-env.ts`의 `/bin/bash --login -c 'printf %s "$PATH"'`)가 macOS에서 그대로 유효하다.

### 3.3 단축키 — `src/renderer/src/keymap.ts`

keymap이 단일 소스이고 리매핑을 지원하므로 **기본값만 플랫폼화**한다. 사용자가 저장한 리매핑은 건드리지 않는다.

- darwin 기본값: `Ctrl+P/S/,/=/-/0` → `Cmd+…`, `F11`(전체 화면) → `Ctrl+Cmd+F`, `F12`(개발자 도구) → `Cmd+Option+I`, `Ctrl+PageUp/Down`(페이지 전환)은 유지하되 동작 확인.
- 디스패처의 수식키 판정(ctrlKey/metaKey)과 메뉴 라벨 표기(⌘)도 darwin을 따른다.
- 터미널 내부는 유리해진다: macOS 복사/붙여넣기는 `Cmd+C/V`라 `Ctrl+C`(SIGINT)와 충돌하지 않는다. `edit.*` fixed 항목은 xterm 동작을 darwin에서 검증한다.

### 3.4 트레이·독·창 생명주기

- 트레이 아이콘(`tray-icon.ts`): macOS 메뉴바용 **템플릿 이미지**(모노크롬 + @2x)를 추가한다.
- "창 닫기(✕) → 트레이 상주" 설정: macOS 관례(창을 닫아도 앱은 Dock에 유지, Dock 클릭·전역 단축키로 복귀)에 맞게 동작을 확인한다. `Cmd+Q`는 세션 정리 후 실제 종료.
- 작업표시줄 진행률·배지(`window-badge.ts`): Electron의 `setProgressBar`/`app.badgeCount`가 macOS Dock에 대응되는지 확인하고 어긋나는 것만 분기한다.
- 알림: Electron `Notification`은 macOS 지원. 첫 알림에서 OS 권한 요청이 뜬다. ad-hoc 서명 앱의 알림 전달은 Phase 2 패키징 후 실기기로 검증한다.

### 3.5 자동 업데이트 — `src/main/updater.ts`, `updater-platform.ts`

- darwin: 자동 확인·다운로드를 하지 않는다. 사이드바 업데이트 배지는 기존 실패 폴백과 같은 **`릴리스` 링크**를 보여 수동 설치를 안내한다.
- 공개 단계(Phase 4)에서 Developer ID 서명+공증과 함께 켠다 — electron-updater macOS는 `zip` 타깃이 필요하므로 dist 타깃에 zip을 미리 포함해 둔다.

### 3.6 `jk` 제어 CLI — `src/main/control/`

- Linux 방식(127.0.0.1 임의 포트 + 실행별 bearer token, `CONTROL_*` 환경변수)이 POSIX 공통이라 darwin에서 재사용한다. Windows named pipe 분기는 그대로.
- CLI 설치 경로가 zsh 로그인 셸 PATH에 잡히는지 확인한다(`~/.local/bin`은 macOS 기본 PATH가 아님 — 세션 환경에 주입되는지 또는 프로필 안내가 필요한지 구현 시 확인).

### 3.7 그대로 동작 예상 (확인만)

- `safeStorage` → macOS Keychain (노션 토큰 암호화).
- 원격 서버(`src/main/remote/`) — Tailscale 주소 bind·페어링·웹 서빙은 플랫폼 중립. **Mac 호스트도 Android 폰에 APK를 서빙**하므로 `extraResources`(shell.apk) 동봉 구조는 mac 패키징에도 유지한다.
- Claude 상태 훅의 Python3 — macOS는 CLT와 함께 `/usr/bin/python3` 제공.
- Google Drive 업무 프로젝트 루트(`settings/pc-roots.ts`, `projects/drive-service.ts`): 1차는 수동 지정으로 충분. darwin 자동 탐지(`~/Library/CloudStorage/GoogleDrive-…`)는 후속. NFD 정규화는 이미 처리돼 있다.

### 3.8 패키징 — `package.json`

- `dist:mac` 스크립트 추가: `electron-builder --mac dmg zip --arm64 --publish never`.
- `build.mac`: `category: public.app-category.developer-tools`, `icon: build/icon.png`(electron-builder가 icns 변환), `identity: null`(ad-hoc), `artifactName: Multi-CLI-Work-${version}-mac-arm64.${ext}`.
- hardened runtime·entitlements·공증 설정은 Phase 4에서 추가한다.

### 3.9 테스트

- 유닛: 기존 테스트가 `platform: NodeJS.Platform` 인자를 받는 구조라 darwin 케이스 추가가 자연스럽다(`window-chrome.test.ts`에 이미 존재). **신규 darwin 분기마다 유닛 테스트를 동반**한다.
- e2e(Playwright): macOS는 Xvfb 없이 구동된다. Windows/Linux 전제가 박힌 테스트는 darwin 스킵 조건을 정리하고, `@smoke` 묶음의 macOS 통과를 Phase 2 완료 기준으로 삼는다.
- CI: macOS 러너 추가는 Phase 4. 그때 `verify`(test·typecheck·build)부터 올린다.

## 4. iPhone(웹) 설계

전제: iPhone에 Tailscale 앱 설치·로그인. 흐름: Safari에서 `http://<호스트 Tailscale 주소>:<포트>/mobile/` → 페어링 코드 입력 → **홈 화면에 추가** → 전체 화면 앱처럼 사용.

| # | 작업 | 위치 |
|---|---|---|
| 1 | 홈 화면 메타: `apple-touch-icon`, standalone 모드 메타, `viewport-fit=cover` | `src/renderer/mobile.html` |
| 2 | Safe area: `env(safe-area-inset-*)` 패딩(노치·홈 인디케이터) | `src/renderer/src/mobile/mobile.css` |
| 3 | iOS Safari 실기기 검증: 키보드(visualViewport)·터치 스크롤·회전·세션 입출력 — Android WebView 기준으로 작성된 `touch-scroll`·`terminal-input`·`auto-fit`·`initial-size`에서 어긋나는 것만 보정 | `src/renderer/src/mobile/` |
| 4 | `/install` 안내 페이지에 iPhone용 "홈 화면 추가" 안내 추가(현재 APK 링크만 있음) | `src/main/remote/remote-server.ts` `installPage()` |
| 5 | (선택·후속) 페어링 QR의 URL 폴백(`/mobile/#pair=<code>`) — iPhone 카메라로 바로 페어링. 1차는 코드 수동 입력으로 충분 | — |

**알아둘 제약**: Safari 탭으로만 쓰면 7일 미사용 시 ITP가 localStorage(페어링 토큰)를 지울 수 있다. 홈 화면 추가 시에는 해당되지 않으므로 홈 화면을 기본 흐름으로 안내한다(문서화).

## 5. 개발환경 구축

| 단계 | 작업 | 비고 |
|---|---|---|
| 1 | Xcode Command Line Tools: `xcode-select --install` | `node-pty` 컴파일 필수. 전체 Xcode 불필요(네이티브 셸 보류) |
| 2 | `npm ci` | postinstall이 `electron-builder install-app-deps`로 node-pty를 Electron ABI에 맞춰 빌드. 실패 시 `npm run rebuild:native` |
| 3 | `npm run dev` · `npm test` · `npm run typecheck` | macOS 첫 기동 검증. 로컬 Node v25는 engines(>=22.12) 충족 — node-pty 빌드가 Node 버전을 타면 nvm으로 22 LTS 폴백 |
| 4 | iPhone에 Tailscale 설치·로그인 | 웹 컴패니언 테스트용. 개발 중엔 이 Mac이 호스트 |

Android 로컬 환경은 불필요(릴리스 CI가 APK 빌드). Xcode 전체 설치는 네이티브 셸 착수 시점으로 연기.

## 6. 로드맵

- **Phase 0 — 환경**: §5 수행, dev 모드 기동과 기존 테스트 통과 확인. Electron 43 × macOS 26 호환도 여기서 즉시 드러난다.
- **Phase 1 — macOS 필수 분기**: 창 크롬(§3.1)·zsh(§3.2)·단축키(§3.3)·업데이터 off(§3.5)·트레이/독(§3.4) → 일상 사용 가능 수준.
- **Phase 2 — 패키징**: `dist:mac`(§3.8)으로 dmg 설치본을 만들어 직접 사용(dogfood), e2e 스모크 macOS 통과(§3.9), `jk`·알림·Drive 루트 등 §3.6–3.7 확인 항목 정리.
- **Phase 3 — iPhone 웹**: §4의 1–4.
- **Phase 4 — 공개 배포 (추후, 명시적 트리거: Apple Developer 가입)**: Developer ID 서명·공증, 자동 업데이트 on(zip), CI macOS 러너·릴리스 잡, README/installation 문서에 macOS 추가, (검토) universal 바이너리. iOS 네이티브 셸(SwiftUI + WKWebView, Android 셸 대칭)은 **별도 스펙**으로 브레인스토밍부터 다시.

## 7. 리스크와 대응

| 리스크 | 대응 |
|---|---|
| node-pty 빌드 실패(CLT 부재) | 환경 절차 1단계로 못 박음. `rebuild:native` 폴백 |
| 무서명 앱 Gatekeeper 경고 | 개인용 단계는 우클릭-열기 문서화. 공개 단계에서 공증 |
| ad-hoc 앱의 알림 전달 불안정 | Phase 2에서 실기기 검증, 문제 시 권한 안내 추가 |
| e2e의 win/linux 전제 | darwin 스킵 조건 정리, 스모크부터 통과 |
| keymap 기본값 변경의 파급 | 기본값만 플랫폼화, 저장된 리매핑 불변. 기존 win/linux 기본값은 그대로 |
| Safari ITP의 토큰 삭제 | 홈 화면 추가를 기본 흐름으로 안내 |
