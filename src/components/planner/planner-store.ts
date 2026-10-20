/**
 * Browser-side store for the study planner (A4-PLANNER). Offline-first:
 *
 * - Every change is written to `localStorage` at once, so the planner works without a network.
 * - Guests: the state lives only in this browser (key `aspire.planner.guest.v1`, D-034).
 * - Signed-in students (GET /api/planner/state answers 200): the account copy (key
 *   `aspire.planner.account.v1`, tagged with an opaque owner id) is synced with the server —
 *   newest `updatedAt` wins, unsynced changes are pushed with a debounced PUT and retried when
 *   the browser comes back online.
 * - Signing out (the API answers 401/403) switches back to the guest copy; a fully synced account
 *   copy is removed from the device, so the next person on a shared phone does not see it.
 * - Guest data is NEVER uploaded automatically: the student is asked first (`importGuest`).
 *
 * Used through `useSyncExternalStore` (server snapshot = null → the UI renders a loading state
 * during SSR and hydration, then the real state).
 */
import { emptyState, parseState, pruneState, type PlannerState } from "@/lib/planner/state";
import { istDateKey } from "@/lib/planner/dates";

const KEYS = {
  guest: "aspire.planner.guest.v1",
  account: "aspire.planner.account.v1",
  meta: "aspire.planner.meta.v1",
} as const;

export type SyncStatus = "checking" | "local" | "saving" | "saved" | "offline" | "error";

export interface AccountInfo {
  optedIn: boolean;
  nickname: string | null;
  suggestedNickname: string | null;
}

export interface PlannerSnapshot {
  mode: "guest" | "account";
  state: PlannerState;
  sync: SyncStatus;
  /** Signed in, nothing on the account yet, and this browser holds a guest plan. */
  importOffer: boolean;
  account: AccountInfo | null;
}

interface AccountRecord {
  owner: string;
  dirty: boolean;
  state: PlannerState;
}

interface Meta {
  lastMode: "guest" | "account";
  declinedImportFor?: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: PlannerSnapshot | null = null;
let owner: string | null = null;
let dirty = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

// ------------------------------------------------------------------ storage helpers (never throw)

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode): the planner still works for this visit.
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function readGuest(): PlannerState {
  return parseState(read(KEYS.guest)) ?? emptyState();
}

function readAccount(): AccountRecord | null {
  const raw = read(KEYS.account) as Partial<AccountRecord> | null;
  if (!raw || typeof raw.owner !== "string") return null;
  const state = parseState(raw.state);
  return state ? { owner: raw.owner, dirty: raw.dirty === true, state } : null;
}

function readMeta(): Meta {
  const raw = read(KEYS.meta) as Partial<Meta> | null;
  return {
    lastMode: raw?.lastMode === "account" ? "account" : "guest",
    declinedImportFor: typeof raw?.declinedImportFor === "string" ? raw.declinedImportFor : undefined,
  };
}

function writeMeta(patch: Partial<Meta>): void {
  write(KEYS.meta, { ...readMeta(), ...patch });
}

// ------------------------------------------------------------------ snapshot

function emit(next: PlannerSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function patch(next: Partial<PlannerSnapshot>): void {
  if (snapshot) emit({ ...snapshot, ...next });
}

function persist(state: PlannerState): void {
  if (snapshot?.mode === "account" && owner) {
    write(KEYS.account, { owner, dirty, state } satisfies AccountRecord);
  } else {
    write(KEYS.guest, state);
  }
}

function initialSnapshot(): PlannerSnapshot {
  const meta = readMeta();
  const account = meta.lastMode === "account" ? readAccount() : null;
  if (account) {
    owner = account.owner;
    dirty = account.dirty;
    return { mode: "account", state: account.state, sync: "checking", importOffer: false, account: null };
  }
  return { mode: "guest", state: readGuest(), sync: "checking", importOffer: false, account: null };
}

// ------------------------------------------------------------------ server sync

type StateResponse = {
  ok: true;
  data: { state: unknown; savedAt: number | null; owner: string; leaderboard: AccountInfo };
};

async function refreshFromServer(): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/planner/state", { cache: "no-store", credentials: "same-origin" });
  } catch {
    patch({ sync: snapshot?.mode === "account" ? "offline" : "local" });
    return;
  }
  if (response.status === 401 || response.status === 403) {
    switchToGuest();
    return;
  }
  if (!response.ok) {
    patch({ sync: snapshot?.mode === "account" ? "error" : "local" });
    return;
  }
  let body: StateResponse;
  try {
    body = (await response.json()) as StateResponse;
  } catch {
    patch({ sync: "error" });
    return;
  }
  const serverState = parseState(body.data.state);
  const tag = body.data.owner;
  let record = readAccount();
  if (record && record.owner !== tag) record = null; // another account's copy: never mix

  owner = tag;
  writeMeta({ lastMode: "account" });
  const guest = readGuest();
  const declined = readMeta().declinedImportFor === tag;

  if (serverState && (!record || !record.dirty || serverState.updatedAt >= record.state.updatedAt)) {
    dirty = false;
    emit({ mode: "account", state: serverState, sync: "saved", importOffer: false, account: body.data.leaderboard });
    persist(serverState);
    return;
  }
  if (record) {
    dirty = record.dirty;
    emit({ mode: "account", state: record.state, sync: record.dirty ? "saving" : "saved", importOffer: false, account: body.data.leaderboard });
    if (record.dirty) void push();
    return;
  }
  dirty = false;
  const fresh = emptyState();
  emit({
    mode: "account",
    state: fresh,
    sync: "saved",
    importOffer: guest.settings !== null && !declined,
    account: body.data.leaderboard,
  });
  persist(fresh);
}

function switchToGuest(): void {
  const record = readAccount();
  if (record && !record.dirty) remove(KEYS.account); // synced: the server has it
  owner = null;
  dirty = false;
  writeMeta({ lastMode: "guest" });
  emit({ mode: "guest", state: readGuest(), sync: "local", importOffer: false, account: null });
}

async function push(): Promise<void> {
  if (!snapshot || snapshot.mode !== "account" || !dirty) return;
  const sent = snapshot.state;
  patch({ sync: "saving" });
  let response: Response;
  try {
    response = await fetch("/api/planner/state", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state: sent }),
    });
  } catch {
    patch({ sync: "offline" });
    return;
  }
  if (response.status === 401) {
    // Session ended: keep the unsynced copy on the device (dirty) and show the guest view.
    switchToGuest();
    return;
  }
  if (!response.ok) {
    patch({ sync: "error" });
    return;
  }
  if (snapshot?.state === sent) {
    dirty = false;
    persist(sent);
    patch({ sync: "saved" });
  } else {
    schedulePush(); // changed while saving
  }
}

function schedulePush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void push();
  }, 1200);
}

function start(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  if (!snapshot) snapshot = initialSnapshot();
  void refreshFromServer();
  window.addEventListener("online", () => {
    if (dirty) void push();
    else if (snapshot?.sync === "offline") void refreshFromServer();
  });
  window.addEventListener("storage", (event) => {
    if (!snapshot || (event.key !== KEYS.guest && event.key !== KEYS.account)) return;
    if (snapshot.mode === "guest" && event.key === KEYS.guest) patch({ state: readGuest() });
    if (snapshot.mode === "account" && event.key === KEYS.account) {
      const record = readAccount();
      if (record && record.owner === owner) {
        dirty = record.dirty;
        patch({ state: record.state });
      }
    }
  });
}

// ------------------------------------------------------------------ public API

export const plannerStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    start();
    return () => listeners.delete(listener);
  },
  getSnapshot(): PlannerSnapshot | null {
    if (!snapshot && typeof window !== "undefined") snapshot = initialSnapshot();
    return snapshot;
  },
  getServerSnapshot(): PlannerSnapshot | null {
    return null;
  },
  /** Applies a change, stamps `updatedAt`, saves locally and (signed in) schedules a sync. */
  update(change: (state: PlannerState) => PlannerState): void {
    if (!snapshot) return;
    const now = Date.now();
    const next = pruneState({ ...change(snapshot.state), updatedAt: now }, istDateKey(now));
    if (snapshot.mode === "account") dirty = true;
    emit({ ...snapshot, state: next, sync: snapshot.mode === "account" ? "saving" : snapshot.sync });
    persist(next);
    if (snapshot.mode === "account") schedulePush();
  },
  /** Copies this browser's guest plan into the signed-in account (asked first, never automatic). */
  importGuest(): void {
    if (!snapshot || snapshot.mode !== "account") return;
    const guest = readGuest();
    dirty = true;
    const state = { ...guest, updatedAt: Date.now() };
    emit({ ...snapshot, state, importOffer: false, sync: "saving" });
    persist(state);
    remove(KEYS.guest);
    void push();
  },
  declineImport(): void {
    if (!snapshot || !owner) return;
    writeMeta({ declinedImportFor: owner });
    patch({ importOffer: false });
  },
  /** Deletes the planner data of the current mode on this device (and on the account, if signed in). */
  reset(): void {
    if (!snapshot) return;
    if (snapshot.mode === "guest") {
      remove(KEYS.guest);
      emit({ ...snapshot, state: emptyState() });
      return;
    }
    plannerStore.update(() => emptyState());
  },
  setAccountInfo(info: AccountInfo): void {
    patch({ account: info });
  },
  /** Re-checks the session (e.g. after the student signs in in another tab). */
  refresh(): void {
    void refreshFromServer();
  },
};
