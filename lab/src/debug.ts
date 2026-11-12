// Dev-only helpers (never in the hosted build): decode the bill's QR the way the app sees a photo.
import jsQR from "jsqr";

/** Downscale `src` to `h` px tall (via an intermediate step), optional tilt/blur, JPEG round trip, then jsQR. */
export async function decodeBillPhoto(src: HTMLCanvasElement, opts: { mid?: number; h?: number; tilt?: number; blur?: number; quality?: number } = {}) {
  const { mid = 3000, h = 1600, tilt = 0, blur = 0, quality = 0.85 } = opts;
  const step = (from: CanvasImageSource, fw: number, fh: number, th: number, extra?: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const c = document.createElement("canvas");
    c.height = th;
    c.width = Math.round((fw / fh) * th);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    if (extra) extra(ctx, c.width, c.height);
    ctx.drawImage(from, 0, 0, c.width, c.height);
    return c;
  };
  const a = step(src, src.width, src.height, mid);
  const b = step(a, a.width, a.height, h, (ctx, w, hh) => {
    if (tilt) { ctx.translate(w / 2, hh / 2); ctx.rotate((tilt * Math.PI) / 180); ctx.translate(-w / 2, -hh / 2); }
    if (blur) ctx.filter = `blur(${blur}px)`;
  });
  const jpeg = b.toDataURL("image/jpeg", quality);
  const blob = await (await fetch(jpeg)).blob();
  const img = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = b.width;
  c.height = b.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const r = jsQR(data.data, c.width, c.height, { inversionAttempts: "dontInvert" });
  return { size: `${c.width}x${c.height}`, decoded: r?.data ?? null, jpeg };
}
