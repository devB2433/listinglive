import { describe, expect, it } from "vitest";

import { getQuotaSubmissionState } from "@/lib/quota-flow";

describe("getQuotaSubmissionState", () => {
  it("blocks a 4-segment long video when only 2 credits are schedulable", () => {
    const state = getQuotaSubmissionState(4, 2);

    expect(state.requiredQuota).toBe(4);
    expect(state.availableQuota).toBe(2);
    expect(state.canSubmit).toBe(false);
    expect(state.maxShortTaskCount).toBe(2);
    expect(state.maxLongSegmentCount).toBe(2);
  });

  it("allows submission when purchased add-on quota covers the task", () => {
    const state = getQuotaSubmissionState(4, 12);

    expect(state.canSubmit).toBe(true);
    expect(state.availableQuota).toBe(12);
  });
});
