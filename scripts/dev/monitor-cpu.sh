#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/dev/monitor-cpu.sh [duration_sec] [interval_sec] [output_csv]
# Example:
#   bash scripts/dev/monitor-cpu.sh 900 2 /tmp/cpu_monitor.csv

DURATION="${1:-900}"          # default: 15 minutes
INTERVAL="${2:-2}"            # default: 2 seconds
OUT="${3:-/tmp/cpu_monitor_$(date +%Y%m%d_%H%M%S).csv}"

if ! [[ "$DURATION" =~ ^[0-9]+$ ]] || ! [[ "$INTERVAL" =~ ^[0-9]+$ ]] || [ "$INTERVAL" -le 0 ]; then
  echo "Invalid args: duration and interval must be positive integers."
  exit 1
fi

samples=$(( DURATION / INTERVAL ))
if [ "$samples" -le 0 ]; then
  echo "duration must be >= interval."
  exit 1
fi

read_cpu_stat() {
  # returns: total idle
  # shellcheck disable=SC2034
  read -r cpu user nice system idle iowait irq softirq steal guest guest_nice < /proc/stat
  local total=$((user + nice + system + idle + iowait + irq + softirq + steal))
  local idle_all=$((idle + iowait))
  echo "$total $idle_all"
}

sum_cpu_by_pattern() {
  # $1: grep pattern
  ps -eo pcpu,args --no-headers | awk -v pat="$1" '
    $0 ~ pat {sum += $1}
    END {printf "%.2f", sum+0}
  '
}

count_by_pattern() {
  # $1: grep pattern
  ps -eo args --no-headers | awk -v pat="$1" '
    $0 ~ pat {c++}
    END {print c+0}
  '
}

top_proc_line() {
  ps -eo pcpu,pid,comm,args --sort=-pcpu --no-headers | head -n 1 | sed 's/,/ /g'
}

mem_used_pct() {
  awk '
    /MemTotal:/ {t=$2}
    /MemAvailable:/ {a=$2}
    END {
      if (t>0) printf "%.2f", (t-a)*100/t;
      else print "0.00";
    }
  ' /proc/meminfo
}

echo "timestamp,total_cpu_pct,load1,mem_used_pct,ffmpeg_cpu_pct,celery_cpu_pct,ffmpeg_proc_count,celery_proc_count,top_proc" > "$OUT"

read -r prev_total prev_idle < <(read_cpu_stat)

echo "Start monitoring: duration=${DURATION}s interval=${INTERVAL}s output=${OUT}"
echo "Press Ctrl+C to stop early."

for ((i=1; i<=samples; i++)); do
  sleep "$INTERVAL"

  read -r total idle < <(read_cpu_stat)
  total_delta=$((total - prev_total))
  idle_delta=$((idle - prev_idle))
  prev_total=$total
  prev_idle=$idle

  if [ "$total_delta" -gt 0 ]; then
    cpu_pct=$(awk -v td="$total_delta" -v id="$idle_delta" 'BEGIN { printf "%.2f", (td-id)*100/td }')
  else
    cpu_pct="0.00"
  fi

  load1=$(awk '{print $1}' /proc/loadavg)
  mem_pct=$(mem_used_pct)

  ffmpeg_cpu=$(sum_cpu_by_pattern "[f]fmpeg")
  celery_cpu=$(sum_cpu_by_pattern "celery|backend[.]tasks[.]celery_app")
  ffmpeg_cnt=$(count_by_pattern "[f]fmpeg")
  celery_cnt=$(count_by_pattern "celery|backend[.]tasks[.]celery_app")
  top_line=$(top_proc_line)

  ts=$(date +"%F %T")
  echo "${ts},${cpu_pct},${load1},${mem_pct},${ffmpeg_cpu},${celery_cpu},${ffmpeg_cnt},${celery_cnt},\"${top_line}\"" >> "$OUT"
done

echo
echo "Monitoring complete. Output: $OUT"
echo "---- Summary ----"
awk -F',' '
NR==2 {min=$2; max=$2}
NR>1 {
  cpu_sum += $2; cpu_n++
  ff_sum += $5; ff_n++
  if ($2+0 > max+0) max=$2
  if ($2+0 < min+0) min=$2
  if ($5+0 > ff_max+0) ff_max=$5
}
END {
  if (cpu_n==0) { print "No data."; exit }
  printf "Host CPU avg: %.2f%%, peak: %.2f%%, min: %.2f%%\n", cpu_sum/cpu_n, max, min
  printf "ffmpeg CPU avg: %.2f%%, peak: %.2f%%\n", ff_sum/ff_n, ff_max
}
' "$OUT"
