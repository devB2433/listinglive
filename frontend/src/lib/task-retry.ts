import { type VideoTask } from "@/lib/api";

export function canRetryVideoTask(task: Pick<VideoTask, "task_type" | "status" | "error_retryable" | "long_segments">): boolean {
  const isFailedLongTask = task.task_type === "long" && task.status === "failed";
  const hasRetryableLongSegments =
    task.task_type === "long" && !!task.long_segments?.some((segment) => segment.status === "failed" && segment.error_retryable !== false);

  return isFailedLongTask || (task.status === "failed" && task.error_retryable !== false) || hasRetryableLongSegments;
}
