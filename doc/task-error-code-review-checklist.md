# Task Error Code Review Checklist

## Scope

This checklist is for reviewing the current task error-code system, including:

- backend exception normalization
- task / segment persistence fields
- user-facing display policy
- admin troubleshooting visibility
- consistency and future cleanup items

Related reference document:

- `doc/task-error-code-mapping.md`

## A. 已落实

### A1. 结构化错误字段已落库

Status: done

Current fields:

- `error_code`
- `error_source`
- `error_detail`
- `error_retryable`
- `error_message` for backward compatibility

Applied to:

- `video_tasks`
- `long_video_segments`

Review note:

- This part is in place and supports both user display and admin diagnosis.

### A2. 异常归一化已有统一入口

Status: done

Main entry:

- `backend/services/video_service.py`

Core functions:

- `TaskFailureInfo`
- `KNOWN_EXCEPTION_CODE_MAPPINGS`
- `map_known_exception_to_failure()`
- `build_task_failure_info()`
- `fail_video_task()`
- `fail_long_video_task_due_to_segment_error()`

Review note:

- New failures are no longer expected to be written as arbitrary raw strings by default.

### A3. 已明确的异常 -> code 映射

Status: done

Direct mappings currently implemented:

| Exception / condition | Code |
| --- | --- |
| `MissingGreenlet` | `videos.internal.asyncContext` |
| `ProgrammingError` | `videos.internal.persistenceFailed` |
| `SQLAlchemyError` | `videos.internal.persistenceFailed` |
| `FileNotFoundError` | `videos.storage.fileMissing` |
| `httpx.TimeoutException` | `videos.provider.timeout` |
| `TimeoutError` | `videos.provider.timeout` |
| queue timeout with `source_hint=queue` | `videos.task.queueUnavailable` |
| `httpx.HTTPStatusError` | `videos.provider.unavailable` |
| `httpx.HTTPError` | `videos.provider.unavailable` |
| `ConnectionError` | `videos.provider.unavailable` |
| `OSError` | `videos.provider.unavailable` |
| generic `ValueError` | `videos.validation.invalidState` |
| unknown `Exception` | `videos.internal.unexpected` by fallback |

Runtime message rules currently implemented:

| RuntimeError message contains | Code |
| --- | --- |
| starts with `videos.` / `billing.` / `auth.` | keep original code |
| `greenlet_spawn has not been called` | `videos.internal.asyncContext` |
| `await_only()` | `videos.internal.asyncContext` |
| `轮询超时` | `videos.provider.timeout` |
| `未返回可下载的视频地址` | `videos.provider.missingVideoUrl` |
| `视频生成失败` | `videos.provider.failed` |

### A4. API 错误协议已统一

Status: done

Current backend contract:

- `detail: { code, message? }`

Relevant files:

- `backend/api/v1/videos.py`
- `backend/api/deps.py`

Review note:

- This is the basis for the frontend to keep `error_code` rather than flattening everything into one sentence.

### A5. 用户端任务页已改为显示错误码

Status: done

Current user-facing rule:

- show `error_code` directly
- if old data only has `error_message` and it already looks like a code, show that
- otherwise show `legacy.unstructured_error`

Relevant file:

- `frontend/src/app/(dashboard)/videos/tasks/page.tsx`

Review note:

- This now matches the review requirement: user side should display the failure code itself, not generalized wording.

### A6. 管理后台仍保留诊断信息

Status: done

Admin page still keeps:

- `error_code`
- `error_source`
- `error_retryable`
- `error_detail`
- provider timestamps and provider task id

Relevant files:

- `frontend/src/app/admin/tasks/page.tsx`
- `backend/services/admin_task_service.py`
- `backend/schemas/admin.py`

Review note:

- User side is simplified, admin side remains diagnostic-oriented.

### A7. 基本验证已覆盖

Status: done

Verified:

- `backend/tests/test_video_resilience_helpers.py`
- frontend `lint`
- frontend `build`

Review note:

- Current explicit mappings for async-context and persistence errors already have test coverage.

## B. 待改进

### B1. code 命名前缀还不完全统一

Status: pending

Current situation:

- queue-related codes still use `videos.task.*`
- classification logic also recognizes `videos.queue.*`

Examples:

- current: `videos.task.enqueueFailed`
- current: `videos.task.queueUnavailable`
- not yet really adopted as main namespace: `videos.queue.*`

Suggested review decision:

- either keep queue failures under `videos.task.*`
- or migrate future queue failures to `videos.queue.*`

Recommendation:

- For this phase, keep compatibility and do not rename existing codes immediately.

### B2. 仍存在兼容字段 `error_message`

Status: pending

Current situation:

- `error_message` is still dual-written for old consumers and old data compatibility.

Impact:

- logic is slightly more complex
- frontend still needs fallback handling for legacy tasks

Recommendation:

- keep it for now
- evaluate removal only after data backfill and API consumer confirmation

### B3. 不是所有 task 相关 code 都有“异常类级别映射”

Status: pending

Current situation:

- some codes come from explicit `AppError(...)`
- some come from fallback normalization
- only common infrastructure exceptions currently have direct class-based mappings

Examples already explicit via business logic:

- `videos.long.segmentFailed`
- `videos.task.enqueueFailed`
- `videos.task.retryUnavailable`
- `videos.long.invalidSegments`
- `videos.short.permissionDenied`
- `videos.profileCard.permissionDenied`

Recommendation:

- acceptable for now
- but future additions should state whether they are:
  - business rule code
  - explicit exception mapping code
  - fallback code

### B4. `legacy.unstructured_error` 目前只是前端兜底标记

Status: pending

Current situation:

- old records without stable `error_code` will show `legacy.unstructured_error`

Impact:

- good for audit visibility
- not very friendly for historic tasks

Recommendation:

- optionally backfill old failed tasks where possible
- or accept this as a historical-only marker

### B5. locale 中有 task 相关 code，但“是否用户可见”边界还需要长期约束

Status: pending

Current situation:

- locale keeps user-readable translations for many codes
- user task page now shows code directly
- admin page still uses translated summaries

Recommendation:

- define a policy:
  - user page shows raw code only
  - admin page shows code + translated summary + detail
  - form/API inline validation can continue showing translated copy

## C. 建议后续重构

### C1. 做一份单独的“正式错误码注册表”

Status: recommended

Current situation:

- codes are discoverable from code and locale
- but there is no single canonical registry file

Recommended output:

- one source-of-truth document or module containing:
  - code
  - source
  - retryable
  - user-visible or admin-only
  - owner module

Suggested path:

- `doc/task-error-code-registry.md`

### C2. 区分“业务拒绝”和“系统故障”

Status: recommended

Current situation:

- both kinds of codes live under the `videos.*` namespace

Examples of business rejection:

- `videos.short.permissionDenied`
- `videos.common.unsupportedResolution`
- `videos.long.invalidImageCount`

Examples of system fault:

- `videos.provider.timeout`
- `videos.storage.fileMissing`
- `videos.internal.persistenceFailed`

Recommendation:

- keep current namespace for compatibility
- but document the type in the future registry

### C3. 为 provider HTTP 状态码建立更细分映射

Status: recommended

Current situation:

- many HTTP/network failures converge to `videos.provider.unavailable`

Possible future refinement:

- 429 -> `videos.provider.capacityBusy`
- 5xx -> `videos.provider.unavailable`
- 4xx provider business failure -> `videos.provider.failed`

Benefit:

- better retry strategy
- clearer admin diagnosis

### C4. 为历史数据提供 backfill 或迁移脚本

Status: recommended

Current situation:

- old failed tasks may lack `error_code`

Recommendation:

- add optional maintenance script to infer codes from old `error_message`

Benefit:

- admin data becomes more uniform
- user side shows fewer `legacy.unstructured_error`

## D. 当前建议保留的核心 code 集

These are the most important task-related codes that should remain stable in the near term:

- `videos.task.enqueueFailed`
- `videos.task.queueUnavailable`
- `videos.task.executionTimeout`
- `videos.task.retryUnavailable`
- `videos.provider.timeout`
- `videos.provider.unavailable`
- `videos.provider.failed`
- `videos.provider.missingVideoUrl`
- `videos.merge.failed`
- `videos.storage.fileMissing`
- `videos.long.segmentFailed`
- `videos.validation.invalidState`
- `videos.internal.asyncContext`
- `videos.internal.persistenceFailed`
- `videos.internal.unexpected`

## E. 建议你审核时重点确认的 5 个问题

1. 用户端是否长期坚持“只显示错误码，不显示翻译文案”。
2. queue 相关 code 是否继续沿用 `videos.task.*`，还是后续迁移到 `videos.queue.*`。
3. `error_message` 兼容字段是否继续保留到下一阶段。
4. 是否要对历史失败任务做 `error_code` 回填。
5. 是否要把所有 task code 收敛进正式注册表，作为后续新增 code 的准入标准。
