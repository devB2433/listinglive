"use client";

export type PendingShortVideoDraft = {
  id: string;
  task_type: "short";
  service_tier: "standard" | "flex";
  created_at: string;
  image_file: File;
  scene_template_id: string;
  resolution: "480p" | "720p" | "1080p";
  aspect_ratio: "16:9" | "9:16" | "1:1" | "adaptive";
  duration_seconds: number;
  logo_key?: string | null;
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
  scene_template_id: string;
  resolution: "480p" | "720p" | "1080p";
  aspect_ratio: "16:9" | "9:16" | "1:1" | "adaptive";
  duration_seconds: number;
  logo_key?: string | null;
  edit_mode: "unified" | "custom";
  segments: PendingLongVideoSegmentDraft[];
};

export type PendingVideoDraft = PendingShortVideoDraft | PendingLongVideoDraft;

const draftStore = new Map<string, PendingVideoDraft>();

function nextDraftId() {
  return `draft-${crypto.randomUUID()}`;
}

export function createPendingShortVideoDraft(
  input: Omit<PendingShortVideoDraft, "id" | "task_type" | "created_at">,
) {
  const draft: PendingShortVideoDraft = {
    id: nextDraftId(),
    task_type: "short",
    created_at: new Date().toISOString(),
    ...input,
  };
  draftStore.set(draft.id, draft);
  return draft;
}

export function createPendingLongVideoDraft(
  input: Omit<PendingLongVideoDraft, "id" | "task_type" | "created_at">,
) {
  const draft: PendingLongVideoDraft = {
    id: nextDraftId(),
    task_type: "long",
    created_at: new Date().toISOString(),
    ...input,
  };
  draftStore.set(draft.id, draft);
  return draft;
}

export function getPendingVideoDraft(draftId: string) {
  return draftStore.get(draftId) ?? null;
}

export function deletePendingVideoDraft(draftId: string) {
  draftStore.delete(draftId);
}
