import "@testing-library/jest-dom/vitest";
import { MotionGlobalConfig } from "motion/react";
import { afterEach } from "vitest";
import { resetToasts } from "../toast";

// Toasts live in a module-level store, so one case's toast would otherwise show up in the next render.
afterEach(() => resetToasts());

// jsdom never paints, so motion would leave exiting nodes in the DOM waiting on frames.
MotionGlobalConfig.skipAnimations = true;

// motion's reduced-motion check reads matchMedia, which jsdom lacks.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

