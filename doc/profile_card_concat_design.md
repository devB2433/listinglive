# Profile Card Concat Design Notes

## Current State

Current implementation no longer writes a standalone `ending.mp4` and no longer merges `[main, ending]`.
Instead, profile-card tail is appended directly in one write pass (`append_profile_card_tail_to_video_file`).

## Why not move to ffmpeg concat/filtergraph now

The ffmpeg concat/filtergraph route can further reduce Python overhead, but it adds risk:

- More codec/container edge cases
- Higher operational complexity for filtergraph quoting and portability
- Harder error diagnostics compared to current pure-Python imageio path

Given the current priority ("queueable but never crash"), the direct-tail approach provides most of the immediate gain at lower risk.

## Trigger Conditions for Future Upgrade

Move to concat/filtergraph only when one of these is true:

1. CPU peak still exceeds target after queue split + merge semaphore + overlay single-pass
2. End-to-end duration remains above agreed P95 target
3. Need explicit zero-reencode append under strict codec parity constraints

## Proposed Future Path

1. Add ffmpeg pipeline behind a feature flag
2. Run A/B output validation (duration, fps, frame size, visual checks)
3. Flip production only after release gate passes with no regression
