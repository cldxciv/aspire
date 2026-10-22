/**
 * Packed paper item lists (owner: QB-CORE-A; §B4 `qb_papers.items`, `qb_windows.items`). Seven bytes per
 * question: question number `n` (u32 LE), approved snapshot `version` (u16 LE) and the section's index in
 * the blueprint's flattened section list (u8). A NEET paper is 180 × 7 bytes ≈ 1.3 KB. Pure and
 * client-safe (Uint8Array / DataView only).
 */

export const PACKED_ITEM_BYTES = 7;

export interface PackedItem {
  n: number;
  version: number;
  section: number;
}

export function packItems(items: readonly PackedItem[]): Uint8Array {
  const bytes = new Uint8Array(items.length * PACKED_ITEM_BYTES);
  const view = new DataView(bytes.buffer);
  items.forEach((item, i) => {
    if (!Number.isInteger(item.n) || item.n < 0 || item.n > 0xffffffff) throw new RangeError(`items-pack: bad n ${item.n}`);
    if (!Number.isInteger(item.version) || item.version < 0 || item.version > 0xffff) {
      throw new RangeError(`items-pack: bad version ${item.version}`);
    }
    if (!Number.isInteger(item.section) || item.section < 0 || item.section > 0xff) {
      throw new RangeError(`items-pack: bad section ${item.section}`);
    }
    const offset = i * PACKED_ITEM_BYTES;
    view.setUint32(offset, item.n, true);
    view.setUint16(offset + 4, item.version, true);
    view.setUint8(offset + 6, item.section);
  });
  return bytes;
}

export function unpackItems(blob: Uint8Array | ArrayBuffer): PackedItem[] {
  const bytes = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  if (bytes.length % PACKED_ITEM_BYTES !== 0) throw new RangeError("items-pack: truncated item list");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const items: PackedItem[] = [];
  for (let offset = 0; offset < bytes.length; offset += PACKED_ITEM_BYTES) {
    items.push({ n: view.getUint32(offset, true), version: view.getUint16(offset + 4, true), section: view.getUint8(offset + 6) });
  }
  return items;
}
