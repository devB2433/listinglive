---
name: listinglive-regression-framework
description: Run ListingLive regression framework from sibling repo with quick/core/full modes, collect reports, and debug from failure-summary. Use when user asks for 全面回归测试, 全量回归, 回归门禁, 发布前回归, or asks to run/regress/debug automated tests.
---
# ListingLive Regression Framework

## Purpose

Use the existing standalone regression repository to execute automated regression and produce debug-ready artifacts.

- App repo: `C:/Data/projects/listinglive`
- Test repo: `C:/Data/projects/listinglive-regression`
- Entry script: `scripts/run-regression.ps1`

## When To Use

Trigger this skill when user mentions:

- 全面回归测试
- 全量回归
- 回归门禁
- 发布前回归
- 自动化回归失败排查

## Execution Steps

1. Ensure test repo exists: `C:/Data/projects/listinglive-regression`
2. Choose mode by intent:
   - `quick`: auth smoke
   - `core`: release-blocking P0
   - `full`: full regression
3. Run command:
   - `pwsh -File ./scripts/run-regression.ps1 -Mode <quick|core|full>`
4. Verify artifacts:
   - `reports/results.json`
   - `reports/html/index.html`
   - `reports/failure-summary.md`
5. If failed, summarize:
   - failed suites
   - top error snippets
   - next rerun command

## Debug Handoff Contract

When tests fail, always ask user to provide:

- `reports/failure-summary.md`
- `reports/results.json`
- optional `reports/html/index.html`

Then debug using those files first.

## Response Template

- Executed mode: `quick/core/full`
- Result: pass/fail
- Report paths
- If fail: top 1-3 failing tests + suggested rerun command

## Production Safety Addendum (2026-03)

For release-critical changes that involve visual rendering (profile cards, text overlay, image composition), regression pass alone is not enough. Add the following checks before pushing production deployment guidance:

1. **Container Environment Parity**
   - Verify rendering dependencies in runtime image (fonts/codecs/libs), not only local dev machine.
   - For Linux runtime, avoid relying on Windows-only fonts (`arial.ttf`, `Segoe Script.ttf`, etc.).

2. **Render Path Verification In-Container**
   - Run/preview at least one real render path in containerized environment (e.g., profile card preview endpoint).
   - Confirm no fallback to tiny default font (`ImageFont.load_default`) in final output.

3. **Release Gate for Rendering Changes**
   - Treat render/font dependency checks as release gate item alongside `full` regression.
   - If render stack changed, explicitly report: image dependencies, verification command, and visual sanity result.

4. **Mandatory Postmortem Capture**
   - When a prod issue is caused by env mismatch (e.g., missing fonts), update this skill with:
     - root cause,
     - missed guardrail,
     - permanent checklist item.
