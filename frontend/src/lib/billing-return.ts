"use client";

export type BillingReturnIntent = {
  returnTo: string;
  draftId?: string;
  resumeMode?: "edit" | "submit";
  taskType?: "short" | "long";
  savedAt: string;
};

const BILLING_RETURN_INTENT_KEY = "listinglive.billing.return-intent";
const BILLING_RETURN_INTENT_TTL_MS = 30 * 60 * 1000;

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function saveBillingReturnIntent(intent: Omit<BillingReturnIntent, "savedAt">) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(
    BILLING_RETURN_INTENT_KEY,
    JSON.stringify({
      ...intent,
      savedAt: new Date().toISOString(),
    } satisfies BillingReturnIntent),
  );
}

export function getBillingReturnIntent() {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(BILLING_RETURN_INTENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BillingReturnIntent;
    const savedAtMs = Date.parse(parsed.savedAt);
    if (!parsed.returnTo || Number.isNaN(savedAtMs)) {
      storage.removeItem(BILLING_RETURN_INTENT_KEY);
      return null;
    }
    if (Date.now() - savedAtMs > BILLING_RETURN_INTENT_TTL_MS) {
      storage.removeItem(BILLING_RETURN_INTENT_KEY);
      return null;
    }
    return parsed;
  } catch {
    storage.removeItem(BILLING_RETURN_INTENT_KEY);
    return null;
  }
}

export function clearBillingReturnIntent() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(BILLING_RETURN_INTENT_KEY);
}

export function resolveBillingReturnTarget(intent: BillingReturnIntent | null) {
  return intent?.returnTo ?? "/billing";
}
