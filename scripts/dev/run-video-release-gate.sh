#!/usr/bin/env bash
set -euo pipefail

# Release gate for video pipeline changes.
# - Captures CPU baseline using monitor-cpu.sh
# - Runs queue load test
# - Evaluates simple pass/fail thresholds
#
# Usage:
#   bash scripts/dev/run-video-release-gate.sh [tasks] [duration_sec] [interval_sec] [out_dir]

TASKS="${1:-6}"
DURATION="${2:-600}"
INTERVAL="${3:-2}"
OUT_DIR="${4:-/tmp/listinglive_release_gate_$(date +%Y%m%d_%H%M%S)}"

CPU_PEAK_MAX="${GATE_CPU_PEAK_MAX:-95}"
FAILURE_RATE_MAX="${GATE_FAILURE_RATE_MAX:-0}"

mkdir -p "$OUT_DIR"
CPU_CSV="${OUT_DIR}/cpu.csv"
LOADTEST_LOG="${OUT_DIR}/queue-load-test.log"

echo "[gate] output_dir=${OUT_DIR}"
echo "[gate] cpu_peak_max=${CPU_PEAK_MAX}% failure_rate_max=${FAILURE_RATE_MAX}%"

bash scripts/dev/monitor-cpu.sh "$DURATION" "$INTERVAL" "$CPU_CSV" > "${OUT_DIR}/monitor.log" 2>&1 &
MONITOR_PID=$!

cleanup() {
  if kill -0 "$MONITOR_PID" >/dev/null 2>&1; then
    kill "$MONITOR_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

python scripts/dev/queue_load_test.py --tasks "$TASKS" --timeout "$DURATION" | tee "$LOADTEST_LOG"

wait "$MONITOR_PID" || true

CPU_PEAK="$(awk -F',' 'NR>1 {if ($2+0 > max+0) max=$2} END {printf "%.2f", max+0}' "$CPU_CSV")"
FAILURE_RATE="$(awk -F'=' '/failure_rate_percent=/{print $2}' "$LOADTEST_LOG" | tail -n 1)"
if [[ -z "${FAILURE_RATE}" ]]; then
  FAILURE_RATE="100.00"
fi

echo "[gate] cpu_peak=${CPU_PEAK}%"
echo "[gate] failure_rate=${FAILURE_RATE}%"

cpu_ok="$(awk -v v="$CPU_PEAK" -v m="$CPU_PEAK_MAX" 'BEGIN{print (v<=m)?1:0}')"
fail_ok="$(awk -v v="$FAILURE_RATE" -v m="$FAILURE_RATE_MAX" 'BEGIN{print (v<=m)?1:0}')"

if [[ "$cpu_ok" != "1" ]]; then
  echo "[gate] FAIL: cpu peak ${CPU_PEAK}% > ${CPU_PEAK_MAX}%"
  exit 1
fi
if [[ "$fail_ok" != "1" ]]; then
  echo "[gate] FAIL: failure rate ${FAILURE_RATE}% > ${FAILURE_RATE_MAX}%"
  exit 1
fi

echo "[gate] PASS"
