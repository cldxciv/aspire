import { PhotoError, preparePhoto, type PreparedPhoto } from "@/components/ask/prepare-photo";
import { ASK_MAX_IMAGE_BYTES, type AskStatus } from "@/lib/ask/constants";

/**
 * Photo questions in the floating Rancho chat (browser side, unit-tested). The image work is the
 * Ask page's `preparePhoto` (imported, not copied): it scales the photo down to at most 1600 px
 * and re-encodes it as a JPEG through a canvas, which removes its metadata (EXIF, including GPS
 * location) on the device. This module adds the panel's checks around it and the bookkeeping for
 * the preview object URLs. Nothing here touches browser storage: a photo lives in memory until it
 * is removed, the chat is cleared or the panel goes away.
 */

export type RanchoPhoto = PreparedPhoto;

export type RanchoPhotoProblem = "unsupported" | "unreadable" | "too_large";

export type RanchoPhotoResult = { ok: true; photo: RanchoPhoto } | { ok: false; problem: RanchoPhotoProblem };

/** The file input's filter: any image, so phones offer both the camera and the gallery (no `capture`). */
export const RANCHO_PHOTO_ACCEPT = "image/*";

/**
 * Largest file the panel will try to open. `preparePhoto` decodes the original at full size before
 * scaling it down, so a huge file (a very large panorama or a crafted image) could exhaust a
 * low-memory phone's tab; such a file is refused as "too large" before it is read. Ordinary phone
 * camera photos are a few MB, well under this.
 */
export const RANCHO_PHOTO_MAX_FILE_BYTES = 30 * 1024 * 1024;

const revokeObjectUrl = (url: string) => URL.revokeObjectURL(url);

/**
 * Largest photo (after re-encoding) the panel sends: `maxImageBytes` from `GET /api/ask`, never
 * more than the shared ASK_MAX_IMAGE_BYTES; the shared constant until the status has loaded.
 */
export function photoByteLimit(status: Pick<AskStatus, "maxImageBytes"> | null | undefined): number {
  const fromServer = status?.maxImageBytes;
  if (typeof fromServer !== "number" || !Number.isFinite(fromServer) || fromServer <= 0) return ASK_MAX_IMAGE_BYTES;
  return Math.min(fromServer, ASK_MAX_IMAGE_BYTES);
}

/**
 * Only images can be prepared (any format the browser can decode: it is re-encoded as a JPEG,
 * one of the API's JPG / PNG / WebP types). An empty type, which some Android pickers report, is
 * tried anyway; a file that can't be decoded then fails as "unreadable".
 */
export function photoFileProblem(file: Pick<File, "type">): "unsupported" | null {
  const type = file.type.trim().toLowerCase();
  return type === "" || type.startsWith("image/") ? null : "unsupported";
}

/**
 * Checks and prepares a chosen file. Never throws. A file over `maxFileBytes` (default
 * RANCHO_PHOTO_MAX_FILE_BYTES) is refused before it is decoded. A prepared photo over `maxBytes`
 * is refused and its preview URL revoked straight away.
 */
export async function loadRanchoPhoto(
  file: File,
  options: {
    maxBytes: number;
    maxFileBytes?: number;
    prepare?: (file: File) => Promise<RanchoPhoto>;
    revoke?: (url: string) => void;
  },
): Promise<RanchoPhotoResult> {
  const { maxBytes, maxFileBytes = RANCHO_PHOTO_MAX_FILE_BYTES, prepare = preparePhoto, revoke = revokeObjectUrl } = options;
  if (photoFileProblem(file)) return { ok: false, problem: "unsupported" };
  if (file.size > maxFileBytes) return { ok: false, problem: "too_large" };
  let photo: RanchoPhoto;
  try {
    photo = await prepare(file);
  } catch (error) {
    return { ok: false, problem: error instanceof PhotoError && error.code === "too_large" ? "too_large" : "unreadable" };
  }
  if (photo.bytes > maxBytes) {
    revoke(photo.previewUrl);
    return { ok: false, problem: "too_large" };
  }
  return { ok: true, photo };
}

export interface PreviewUrls {
  /** Another holder (the composer or a sent message) now shows this URL. */
  hold(url: string): void;
  /** That holder is done with it; the URL is revoked when its last holder lets go. */
  release(url: string | null | undefined): void;
  /** Revokes every URL still held ("New chat", or the panel unmounting). */
  releaseAll(): void;
  /** How many URLs are still alive. */
  readonly size: number;
}

/**
 * Object URLs of the photo previews. The composer and a sent message can show the same photo
 * (a photo given back after a failed send), so each holder takes a hold and the URL is revoked only
 * when the last one lets go. Releasing an unknown or already-revoked URL does nothing.
 */
export function createPreviewUrls(revoke: (url: string) => void = revokeObjectUrl): PreviewUrls {
  const holds = new Map<string, number>();
  return {
    hold(url) {
      holds.set(url, (holds.get(url) ?? 0) + 1);
    },
    release(url) {
      if (!url) return;
      const count = holds.get(url);
      if (count === undefined) return;
      if (count > 1) {
        holds.set(url, count - 1);
        return;
      }
      holds.delete(url);
      revoke(url);
    },
    releaseAll() {
      const urls = [...holds.keys()];
      holds.clear();
      for (const url of urls) revoke(url);
    },
    get size() {
      return holds.size;
    },
  };
}
