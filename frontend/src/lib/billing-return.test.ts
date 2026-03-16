import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearBillingReturnIntent,
  getBillingReturnIntent,
  resolveBillingReturnTarget,
  saveBillingReturnIntent,
} from "@/lib/billing-return";

describe("billing return intent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("persists the resume target for returning to a blocked draft submission", () => {
    saveBillingReturnIntent({
      returnTo: "/videos/tasks?draft=draft-123",
      draftId: "draft-123",
      resumeMode: "submit",
      taskType: "long",
    });

    expect(getBillingReturnIntent()).toMatchObject({
      returnTo: "/videos/tasks?draft=draft-123",
      draftId: "draft-123",
      resumeMode: "submit",
      taskType: "long",
    });
  });

  it("expires stale resume state and falls back to billing", () => {
    const staleSavedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    window.localStorage.setItem(
      "listinglive.billing.return-intent",
      JSON.stringify({
        returnTo: "/videos/create",
        savedAt: staleSavedAt,
      }),
    );

    expect(getBillingReturnIntent()).toBeNull();
    expect(resolveBillingReturnTarget(null)).toBe("/billing");
  });

  it("clears saved resume state", () => {
    saveBillingReturnIntent({
      returnTo: "/videos/merge",
      resumeMode: "edit",
    });

    clearBillingReturnIntent();

    expect(getBillingReturnIntent()).toBeNull();
  });
});
