import { describe, expect, it } from "vitest";

import { canRetryVideoTask } from "@/lib/task-retry";

describe("canRetryVideoTask", () => {
  it("keeps failed short tasks blocked when backend marks them non-retryable", () => {
    expect(
      canRetryVideoTask({
        task_type: "short",
        status: "failed",
        error_retryable: false,
        long_segments: null,
      }),
    ).toBe(false);
  });

  it("allows failed long tasks even when parent error is marked non-retryable", () => {
    expect(
      canRetryVideoTask({
        task_type: "long",
        status: "failed",
        error_retryable: false,
        long_segments: [
          {
            id: "seg-1",
            sort_order: 0,
            image_key: "image-1",
            duration_seconds: 5,
            status: "failed",
            queued_at: "",
            created_at: "",
            updated_at: "",
          },
        ],
      }),
    ).toBe(true);
  });

  it("allows long tasks with retryable failed segments while parent is still processing", () => {
    expect(
      canRetryVideoTask({
        task_type: "long",
        status: "processing",
        error_retryable: false,
        long_segments: [
          {
            id: "seg-1",
            sort_order: 0,
            image_key: "image-1",
            duration_seconds: 5,
            status: "failed",
            error_retryable: true,
            queued_at: "",
            created_at: "",
            updated_at: "",
          },
        ],
      }),
    ).toBe(true);
  });
});
