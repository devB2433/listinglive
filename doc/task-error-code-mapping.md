# Task Error Code Mapping

## Purpose

This document records the current exception-to-error-code mapping used by the task pipeline so it can be reviewed independently from UI copy.

## Main Normalization Entry

- `backend/services/video_service.py`
- Core functions:
  - `TaskFailureInfo`
  - `KNOWN_EXCEPTION_CODE_MAPPINGS`
  - `map_known_exception_to_failure()`
  - `build_task_failure_info()`
  - `fail_video_task()`
  - `fail_long_video_task_due_to_segment_error()`

## Explicit Exception Mapping

| Exception / condition | Mapped code | Source | Retryable |
| --- | --- | --- | --- |
| `AppError(code=...)` | keep original code | inferred from code | inferred from code |
| `PermissionDeniedError(code=...)` | keep original code | inferred from code | inferred from code |
| `TaskFailureInfo(code=...)` | keep original code | keep / infer | keep / infer |
| string starting with `videos.` / `billing.` / `auth.` | keep original code | inferred from code | inferred from code |
| plain string without stable code | `fallback_code` | hint / inferred | hint / inferred |
| `MissingGreenlet` | `videos.internal.asyncContext` | `internal` | `false` |
| `ProgrammingError` | `videos.internal.persistenceFailed` | `internal` | `false` |
| `SQLAlchemyError` | `videos.internal.persistenceFailed` | `internal` | `false` |
| `FileNotFoundError` | `videos.storage.fileMissing` | `storage` | `true` |
| `httpx.TimeoutException` | `videos.provider.timeout` | `provider` | `true` |
| `TimeoutError` | `videos.provider.timeout` | `provider` | `true` |
| queue timeout with `source_hint=queue` | `videos.task.queueUnavailable` | `queue` | `true` |
| `httpx.HTTPStatusError` | `videos.provider.unavailable` | `provider` | `true` |
| `httpx.HTTPError` | `videos.provider.unavailable` | `provider` | `true` |
| `ConnectionError` | `videos.provider.unavailable` | `provider` | `true` |
| `OSError` | `videos.provider.unavailable` | `provider` | `true` |
| `ValueError` with explicit fallback | `fallback_code` | hint / inferred | hint / inferred |
| generic `ValueError` | `videos.validation.invalidState` | `validation` | inferred |
| unknown `Exception` | `fallback_code` or `videos.internal.unexpected` | hint / inferred | hint / inferred |

## RuntimeError String Rules

These are normalized before generic exception-class mapping:

| RuntimeError message contains | Mapped code |
| --- | --- |
| starts with `videos.` / `billing.` / `auth.` | keep original code |
| `greenlet_spawn has not been called` | `videos.internal.asyncContext` |
| `await_only()` | `videos.internal.asyncContext` |
| `轮询超时` | `videos.provider.timeout` |
| `未返回可下载的视频地址` | `videos.provider.missingVideoUrl` |
| `视频生成失败` | `videos.provider.failed` |

## Where Codes Are Persisted

- `backend/models/video_task.py`
- `backend/models/long_video_segment.py`

Stored fields:

- `error_code`
- `error_source`
- `error_detail`
- `error_retryable`
- `error_message` (compatibility field)

## Where Codes Are Returned

- User task API schema: `backend/schemas/video.py`
- Admin task API schema: `backend/schemas/admin.py`
- Task API route normalization: `backend/api/v1/videos.py`
- Auth dependency normalization: `backend/api/deps.py`

## Frontend Display Policy

- User task page: `frontend/src/app/(dashboard)/videos/tasks/page.tsx`
  - displays `error_code` directly
  - falls back to `error_message` only if it already looks like a code
  - otherwise shows `legacy.unstructured_error`
- Admin task page: `frontend/src/app/admin/tasks/page.tsx`
  - displays `error_code`
  - also keeps translated summary and `error_detail` for troubleshooting

## Current Review Notes

- Queue-related codes still partly use `videos.task.*` instead of fully moving to `videos.queue.*`
- `error_message` is still dual-written for backward compatibility
- New codes must be added to `frontend/src/lib/locale.ts` if translated summaries are needed in admin or other surfaces
