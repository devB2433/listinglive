# Video Pipeline Release Gate

This document defines the baseline and release gate for queue/merge/overlay changes.

## Scope

- CPU peak during video processing window
- Queue load test failure rate
- Queue delay and processing duration snapshots

## Regression Repo Note

The zero-cost long-video local load test script has been moved to the regression repository:

- `c:\Data\projects\listinglive-regression\scripts\long-local-loadtest.mjs`

The app repository keeps execution-chain capabilities only; loadtest orchestration now lives in `listinglive-regression`.

## One-command Gate

```bash
bash scripts/dev/run-video-release-gate.sh 6 600 2 /tmp/listinglive_gate
```

Arguments:

- `tasks`: queue load test task count (default `6`)
- `duration_sec`: monitor duration (default `600`)
- `interval_sec`: monitor sample interval (default `2`)
- `out_dir`: output folder

Outputs:

- `cpu.csv`: sampled host CPU and ffmpeg/celery process usage
- `queue-load-test.log`: queue load summary and failure rate
- `monitor.log`: monitor script console output

## Gate Thresholds

Use env vars to tune thresholds:

- `GATE_CPU_PEAK_MAX` (default `95`)
- `GATE_FAILURE_RATE_MAX` (default `0`)

Example:

```bash
GATE_CPU_PEAK_MAX=90 GATE_FAILURE_RATE_MAX=0 bash scripts/dev/run-video-release-gate.sh
```

## Production Rollout Checklist

1. Apply queue split (`video-io` and `video-cpu`) and worker concurrency (`CPU=1`, `IO=10`)
2. Keep `VIDEO_PROVIDER_CONCURRENCY_LIMIT=1`
3. Keep `VIDEO_LONG_MERGE_CONCURRENCY_LIMIT=1`
4. Run full-container regression
5. Run this release gate and archive output artifacts
6. Promote only when gate passes
