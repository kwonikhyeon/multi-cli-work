import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TRAY_ICON_PNG_16_BASE64,
  TRAY_ICON_PNG_32_BASE64,
  trayIconDataUrl,
  trayTemplateBitmap,
} from "./tray-icon";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngDimensions(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe("tray-icon PNG data", () => {
  it("decodes the 16px PNG with a valid signature and 16x16 dimensions", () => {
    const buffer = Buffer.from(TRAY_ICON_PNG_16_BASE64, "base64");
    expect(buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(readPngDimensions(buffer)).toEqual({ width: 16, height: 16 });
  });

  it("decodes the 32px PNG with a valid signature and 32x32 dimensions", () => {
    const buffer = Buffer.from(TRAY_ICON_PNG_32_BASE64, "base64");
    expect(buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(readPngDimensions(buffer)).toEqual({ width: 32, height: 32 });
  });

  it("builds a data URL with the PNG mime prefix", () => {
    expect(trayIconDataUrl(16)).toBe(`data:image/png;base64,${TRAY_ICON_PNG_16_BASE64}`);
    expect(trayIconDataUrl(32)).toBe(`data:image/png;base64,${TRAY_ICON_PNG_32_BASE64}`);
  });
});

describe("build/icon.png", () => {
  const iconPath = path.resolve(__dirname, "../../build/icon.png");

  it("exists as a 256x256 PNG for electron-builder", () => {
    const buffer = fs.readFileSync(iconPath);
    expect(buffer.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(readPngDimensions(buffer)).toEqual({ width: 256, height: 256 });
  });
});

describe("trayTemplateBitmap", () => {
  it("BGRA 버퍼 크기가 맞고, 글리프 픽셀은 검정이며 알파가 있다", () => {
    for (const size of [16, 32] as const) {
      const bitmap = trayTemplateBitmap(size);
      expect(bitmap.length).toBe(size * size * 4);
      let opaque = 0;
      for (let offset = 0; offset < bitmap.length; offset += 4) {
        const alpha = bitmap[offset + 3];
        if (alpha === 0) continue;
        opaque += 1;
        // premultiplied-BGRA 검정: 색 채널은 전부 0이어야 한다.
        expect(bitmap[offset]).toBe(0);
        expect(bitmap[offset + 1]).toBe(0);
        expect(bitmap[offset + 2]).toBe(0);
      }
      // `>`와 `_`가 실제로 그려졌다 — 전체의 5% 이상이 불투명.
      expect(opaque).toBeGreaterThan(size * size * 0.05);
    }
  });
});
