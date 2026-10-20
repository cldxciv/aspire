import { ASK_MAX_IMAGE_BYTES, ASK_MAX_IMAGE_DIMENSION } from "@/lib/ask/constants";

/**
 * Browser-only: turns the chosen photo into a JPEG of at most ASK_MAX_IMAGE_DIMENSION px on the
 * longer side. Re-encoding through a canvas also drops the photo's metadata (EXIF, including
 * any GPS location) before it leaves the device. Nothing is uploaded until the student sends.
 */

export interface PreparedPhoto {
  mediaType: "image/jpeg";
  base64: string;
  bytes: number;
  /** Object URL for the preview; revoke it when the photo is replaced or removed. */
  previewUrl: string;
}

export class PhotoError extends Error {
  constructor(readonly code: "unreadable" | "too_large") {
    super(code);
    this.name = "PhotoError";
  }
}

/** Scale factor so the longer side fits `max` (never enlarges). */
export function fitScale(width: number, height: number, max: number = ASK_MAX_IMAGE_DIMENSION): number {
  const longest = Math.max(width, height);
  return longest > max ? max / longest : 1;
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError("unreadable");
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(new PhotoError("unreadable"));
    reader.readAsDataURL(blob);
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith("image/") && file.type !== "") throw new PhotoError("unreadable");
  const decoded = await decode(file);
  try {
    if (!decoded.width || !decoded.height) throw new PhotoError("unreadable");
    const scale = fitScale(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoError("unreadable");
    context.fillStyle = "#ffffff"; // transparent PNGs become white, not black
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    let blob = await toBlob(canvas, 0.85);
    if (blob && blob.size > ASK_MAX_IMAGE_BYTES) blob = await toBlob(canvas, 0.6);
    if (!blob) throw new PhotoError("unreadable");
    if (blob.size > ASK_MAX_IMAGE_BYTES) throw new PhotoError("too_large");
    return { mediaType: "image/jpeg", base64: await blobToBase64(blob), bytes: blob.size, previewUrl: URL.createObjectURL(blob) };
  } finally {
    decoded.close();
  }
}
