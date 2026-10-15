// PNG data for the tray/window icon (dark rounded square, teal `>_` glyph).
// Electron's nativeImage cannot decode SVG data URLs, so pre-rendered PNGs
// are embedded here rather than generated at runtime.

export const TRAY_ICON_PNG_16_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACxSURBVDhPY2BgYGCQV1VNUFBV2a+gqvKfSLxfXkWlAqQXphldAVFYXlW5gUFBRfk8ugQJ+D0DFkGSMIoByno6YIyuCB9GMUDTwea/86QWkgzB8AKphmAYAMI6Xi5gQ9DFsWEMA0A2gzSDXIIuhw1jBCIpmjEMAGlE1gzyiv/2JSgYJIbTAHIwFQxQUbmPLkgC/s6goKrcj0WCOKyispxBXl6eQ0FFZT6GJGG8XV5eXgAAY9xrI7HcxN0AAAAASUVORK5CYII=";

export const TRAY_ICON_PNG_32_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAF+SURBVFhH7ZchT8QwFIArkfyDlrzX47hAcgEzcWICkgXIYZAIBBqNxJ08HAiSO4HBQII5OYlEIvkJSGTh3W7L0m7tMtaqa/JlWd9r39cla/IYKw2OGAkJEyExFRJVx6RCwpQDJOWaWWHON1eF9UV+QJxRzUJASLg3kvyzyE4PEFcEg8ClvKTTT/VAMBBfmUD4MALh+GYVk0FZC1gFkvmdOnl+UHvjxIh1Ra3A1qCvxm9zdbZ4Wj59SdQKEPsX50sBnxJWAcK3hFOA8CnRSIDQJfBgaOS0obHATjxSpy+PhQS96zltaCSgF4+ur4yctjgFfBYnrAK+ixNWAboFXcV3jw+t6Pk6tQLlm7CqOMXpqs4F66BD2P6YWgFiexSpwVFszBO0aS7ogvbR1+dYBVzQxvon13H9rv8S6IK1ABOIX/pkQH5IYFYRCEXKqDmoCASBS7hdtWZemlE7CJ+c842sPev1+kLCu5HkCyou5bBoTvPBEW+8iiy7MJgUJ/8bvyhRx0jNvvPUAAAAAElFTkSuQmCC";

export function trayIconDataUrl(scale: 16 | 32): string {
  const base64 = scale === 16 ? TRAY_ICON_PNG_16_BASE64 : TRAY_ICON_PNG_32_BASE64;
  return `data:image/png;base64,${base64}`;
}

/**
 * darwin 메뉴바용 템플릿 이미지의 픽셀. 템플릿은 "검정 + 알파"만 읽으므로(라이트/다크 메뉴바가
 * 알아서 반전) 기존 컬러 PNG 대신 `>_` 글리프를 직접 그린다 — window-badge의 attentionDotBitmap과
 * 같은 Electron 무의존 방식이라 유닛 테스트가 된다.
 */
export function trayTemplateBitmap(size: 16 | 32): Buffer {
  const bytes = Buffer.alloc(size * size * 4);
  const scale = size / 16;
  const stroke = Math.max(1, Math.round(1.6 * scale));
  const paint = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    bytes[offset + 3] = 255; // BGRA 검정은 B=G=R=0, A=255
  };
  const paintBox = (x: number, y: number) => {
    for (let dy = 0; dy < stroke; dy += 1) for (let dx = 0; dx < stroke; dx += 1) paint(x + dx, y + dy);
  };
  // `>` — (3,4)→(7,8)→(3,12)의 두 사선 (16px 기준, scale로 확대)
  const steps = Math.round(4 * scale);
  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(3 * scale) + step;
    paintBox(x, Math.round(4 * scale) + step);
    paintBox(x, Math.round(12 * scale) - step - stroke + 1);
  }
  // `_` — 오른쪽 아래 밑줄
  for (let x = Math.round(9 * scale); x <= Math.round(13 * scale); x += 1) {
    paintBox(x, Math.round(11.5 * scale));
  }
  return bytes;
}
