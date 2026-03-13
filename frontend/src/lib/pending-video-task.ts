"use client";

import type { AvatarPosition, OverlayPlacement, ProfileCardOptionFlags, SceneTemplatePropertyType } from "@/lib/api";

export type PendingShortVideoDraft = {
  id: string;
  task_type: "short";
  service_tier: "standard" | "flex";
  created_at: string;
  wizard_step?: 1 | 2 | 3;
  image_file: File;
  property_type: SceneTemplatePropertyType;
  scene_template_id: string;
  resolution: "480p" | "720p" | "1080p";
  aspect_ratio: "16:9" | "9:16" | "1:1" | "adaptive";
  duration_seconds: number;
  logo_key?: string | null;
  logo_placement?: OverlayPlacement | null;
  avatar_key?: string | null;
  avatar_position?: AvatarPosition | null;
  avatar_placement?: OverlayPlacement | null;
  profile_card_id?: string | null;
  profile_card_options?: ProfileCardOptionFlags | null;
};

export type PendingLongVideoSegmentDraft = {
  id: string;
  file: File;
  source_index: number;
  scene_template_id: string;
  duration_seconds: number;
};

export type PendingLongVideoDraft = {
  id: string;
  task_type: "long";
  service_tier: "standard" | "flex";
  created_at: string;
  wizard_step?: 1 | 2 | 3;
  property_type: SceneTemplatePropertyType;
  scene_template_id: string;
  segment_template_seed_id: string;
  resolution: "480p" | "720p" | "1080p";
  aspect_ratio: "16:9" | "9:16" | "1:1" | "adaptive";
  duration_seconds: number;
  logo_key?: string | null;
  logo_placement?: OverlayPlacement | null;
  avatar_key?: string | null;
  avatar_position?: AvatarPosition | null;
  avatar_placement?: OverlayPlacement | null;
  profile_card_id?: string | null;
  profile_card_options?: ProfileCardOptionFlags | null;
  edit_mode: "unified" | "custom";
  segments: PendingLongVideoSegmentDraft[];
};

export type PendingVideoDraft = PendingShortVideoDraft | PendingLongVideoDraft;
export type PendingVideoDraftScope = "short_create" | "long_merge";
export type PendingVideoDraftStatus = "editing" | "ready" | "submitting" | "auth_required";
export type StoredPendingVideoDraft = PendingVideoDraft & {
  scope: PendingVideoDraftScope;
  status: PendingVideoDraftStatus;
  updated_at: string;
};

const draftStore = new Map<string, StoredPendingVideoDraft>();
const DB_NAME = "listinglive-pending-video-drafts";
const STORE_NAME = "drafts";
const ACTIVE_SCOPE_KEY_PREFIX = "listinglive.pending-video-draft.scope.";

function nextDraftId() {
  return `draft-${crypto.randomUUID()}`;
}

function getScopeStorageKey(scope: PendingVideoDraftScope) {
  return `${ACTIVE_SCOPE_KEY_PREFIX}${scope}`;
}

function getActiveDraftIdForScope(scope: PendingVideoDraftScope) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(getScopeStorageKey(scope));
}

function setActiveDraftIdForScope(scope: PendingVideoDraftScope, draftId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getScopeStorageKey(scope), draftId);
}

function clearActiveDraftIdForScope(scope: PendingVideoDraftScope, draftId?: string) {
  if (typeof window === "undefined") return;
  const key = getScopeStorageKey(scope);
  if (!draftId || window.localStorage.getItem(key) === draftId) {
    window.localStorage.removeItem(key);
  }
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error ?? new Error("Failed to open draft database."));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runDraftStoreRequest<T>(
  mode: IDBTransactionMode,
  handler: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  return openDraftDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        transaction.onabort = () => reject(transaction.error ?? new Error("Draft transaction aborted."));
        transaction.onerror = () => reject(transaction.error ?? new Error("Draft transaction failed."));
        transaction.oncomplete = () => database.close();
        handler(store, resolve, reject);
      }),
  );
}

export function createPendingShortVideoDraft(
  input: Omit<PendingShortVideoDraft, "id" | "task_type" | "created_at">,
  options?: Partial<Pick<StoredPendingVideoDraft, "id" | "created_at" | "updated_at" | "scope" | "status">>,
) {
  const now = new Date().toISOString();
  const draft: StoredPendingVideoDraft = {
    id: options?.id ?? nextDraftId(),
    task_type: "short",
    created_at: options?.created_at ?? now,
    updated_at: options?.updated_at ?? now,
    scope: options?.scope ?? "short_create",
    status: options?.status ?? "editing",
    ...input,
  };
  draftStore.set(draft.id, draft);
  return draft;
}

export function createPendingLongVideoDraft(
  input: Omit<PendingLongVideoDraft, "id" | "task_type" | "created_at">,
  options?: Partial<Pick<StoredPendingVideoDraft, "id" | "created_at" | "updated_at" | "scope" | "status">>,
) {
  const now = new Date().toISOString();
  const draft: StoredPendingVideoDraft = {
    id: options?.id ?? nextDraftId(),
    task_type: "long",
    created_at: options?.created_at ?? now,
    updated_at: options?.updated_at ?? now,
    scope: options?.scope ?? "long_merge",
    status: options?.status ?? "editing",
    ...input,
  };
  draftStore.set(draft.id, draft);
  return draft;
}

export async function savePendingVideoDraft(draft: StoredPendingVideoDraft) {
  const now = new Date().toISOString();
  const nextDraft = {
    ...draft,
    updated_at: now,
  } satisfies StoredPendingVideoDraft;
  const previousActiveDraftId = getActiveDraftIdForScope(nextDraft.scope);
  draftStore.set(nextDraft.id, nextDraft);

  await runDraftStoreRequest<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(nextDraft);
    request.onerror = () => reject(request.error ?? new Error("Failed to save draft."));
    request.onsuccess = () => resolve(undefined);
  });

  setActiveDraftIdForScope(nextDraft.scope, nextDraft.id);

  if (previousActiveDraftId && previousActiveDraftId !== nextDraft.id) {
    await deletePendingVideoDraft(previousActiveDraftId);
  }

  return nextDraft;
}

export async function getPendingVideoDraft(draftId: string) {
  const cachedDraft = draftStore.get(draftId);
  if (cachedDraft) {
    return cachedDraft;
  }

  const draft = await runDraftStoreRequest<StoredPendingVideoDraft | null>("readonly", (store, resolve, reject) => {
    const request = store.get(draftId);
    request.onerror = () => reject(request.error ?? new Error("Failed to load draft."));
    request.onsuccess = () => resolve((request.result as StoredPendingVideoDraft | undefined) ?? null);
  });

  if (draft) {
    draftStore.set(draft.id, draft);
  }

  return draft;
}

export async function getActivePendingVideoDraft(scope: PendingVideoDraftScope) {
  const draftId = getActiveDraftIdForScope(scope);
  if (!draftId) return null;
  const draft = await getPendingVideoDraft(draftId);
  if (!draft) {
    clearActiveDraftIdForScope(scope, draftId);
    return null;
  }
  if (draft.scope !== scope) {
    return null;
  }
  return draft;
}

export async function updatePendingVideoDraftStatus(draftId: string, status: PendingVideoDraftStatus) {
  const draft = await getPendingVideoDraft(draftId);
  if (!draft) return null;
  return savePendingVideoDraft({
    ...draft,
    status,
  });
}

export async function deletePendingVideoDraft(draftId: string) {
  const draft = draftStore.get(draftId) ?? (await getPendingVideoDraft(draftId));
  draftStore.delete(draftId);

  await runDraftStoreRequest<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(draftId);
    request.onerror = () => reject(request.error ?? new Error("Failed to delete draft."));
    request.onsuccess = () => resolve(undefined);
  });

  if (draft) {
    clearActiveDraftIdForScope(draft.scope, draftId);
  }
}

export async function clearActivePendingVideoDraft(scope: PendingVideoDraftScope) {
  const draftId = getActiveDraftIdForScope(scope);
  if (!draftId) return;
  await deletePendingVideoDraft(draftId);
}
