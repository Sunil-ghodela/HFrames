import html2canvas from "html2canvas";

let patched = false;

function patchCreatePattern(): void {
  if (patched) return;
  patched = true;
  const orig = CanvasRenderingContext2D.prototype.createPattern;
  CanvasRenderingContext2D.prototype.createPattern = function (
    image: CanvasImageSource,
    repetition: string | null,
  ): CanvasPattern | null {
    if (
      image &&
      "width" in image &&
      "height" in image &&
      ((image as HTMLCanvasElement).width === 0 || (image as HTMLCanvasElement).height === 0)
    ) {
      return null;
    }
    return orig.call(this, image, repetition);
  };
}

export function initCapture(): void {
  patchCreatePattern();
}

export function captureScene(sceneEl: HTMLElement, bgColor: string): Promise<HTMLCanvasElement> {
  return html2canvas(sceneEl, {
    width: 1920,
    height: 1080,
    scale: 1,
    backgroundColor: bgColor,
    logging: false,
    // Safari applies stricter canvas-taint rules than Chrome. SVG data URLs
    // with <filter> elements (e.g. feTurbulence grain backgrounds), certain
    // cross-origin images, and mask/clip-path url() refs can taint the
    // output canvas on WebKit. Without these flags, html2canvas throws
    // `SecurityError: The operation is insecure` on read-back and every
    // shader transition falls through to the hard-cut catch handler —
    // observed in Safari + Claude Design's cross-origin iframe sandbox.
    //
    // useCORS:    send CORS headers on same-/cross-origin image fetches.
    // allowTaint: proceed even when canvas becomes tainted; the resulting
    //             canvas is still usable as a WebGL texture via
    //             gl.texImage2D (no pixel read-back required).
    useCORS: true,
    allowTaint: true,
    ignoreElements: (el: Element) => el.tagName === "CANVAS" || el.hasAttribute("data-no-capture"),
  });
}

/**
 * Capture the incoming scene with .scene-content hidden (background + decoratives only).
 * Shows the scene behind the outgoing scene via z-index, waits 2 rAFs for font rendering,
 * captures, then restores.
 *
 * IMPORTANT: We force `visibility: visible` during capture because the HyperFrames runtime's
 * time-based visibility gate (in `packages/core/src/runtime/init.ts`) sets `style.visibility
 * = "hidden"` on every `[data-start]` element that's outside its current playback window —
 * every frame. When a shader transition fires *before* the incoming scene's `data-start`
 * boundary (the recommended "transition.time = boundary - duration/2" centered placement),
 * the runtime has `visibility: hidden` on the incoming scene. Without the visibility override
 * here, `html2canvas` captures the element as blank → shader transitions from the real
 * outgoing scene to a blank incoming texture → users see content fade/morph into the
 * background color mid-transition (a visible "blink"). Forcing `visibility: visible` only
 * for the duration of the capture fixes this without affecting what the user sees during
 * normal playback.
 */
export function captureIncomingScene(
  toScene: HTMLElement,
  bgColor: string,
): Promise<HTMLCanvasElement> {
  return new Promise<HTMLCanvasElement>((resolve, reject) => {
    const origZ = toScene.style.zIndex;
    const origOpacity = toScene.style.opacity;
    const origVisibility = toScene.style.visibility;
    toScene.style.zIndex = "-1";
    toScene.style.opacity = "1";
    toScene.style.visibility = "visible";

    const contentEl = toScene.querySelector<HTMLElement>(".scene-content");
    if (contentEl) contentEl.style.visibility = "hidden";

    const restore = () => {
      if (contentEl) contentEl.style.visibility = "";
      toScene.style.visibility = origVisibility;
      toScene.style.opacity = origOpacity;
      toScene.style.zIndex = origZ;
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        captureScene(toScene, bgColor).then(resolve, reject).finally(restore);
      });
    });
  });
}
