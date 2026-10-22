/**
 * Browser-side figure preparation (§B12): a pasted or chosen image is drawn onto a canvas no wider
 * than 700 px and encoded as WebP — quality 0.85 for photos, 1.0 for line drawings (sharp lines).
 * The server still checks type by magic bytes, size (≤ 200 KB) and header dimensions.
 */

export const FIGURE_MAX_WIDTH = 700;
export const FIGURE_MAX_BYTES = 200 * 1024;

/** Target size for an image of `width` × `height` (never upscaled). */
export function scaledSize(width: number, height: number, maxWidth = FIGURE_MAX_WIDTH): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) };
  const ratio = maxWidth / width;
  return { width: maxWidth, height: Math.max(1, Math.round(height * ratio)) };
}

export async function prepareFigure(file: Blob, options: { lineDrawing: boolean }): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    const size = scaledSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    // White background: transparent PNG crops read badly on the dark-mode-free paper view.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", options.lineDrawing ? 1 : 0.85));
    if (!blob) throw new Error("encode_failed");
    return { blob, width: size.width, height: size.height };
  } finally {
    bitmap.close();
  }
}

/** The first image on the clipboard of a paste event, if any. */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}
