#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${APP_DIR}/../.." && pwd)"
OPENMAIC_START="${PROJECT_DIR}/infra/scripts/start-openmaic-local.sh"
OPENMAIC_SERVICE="gui/$(id -u)/cn.edu.nju.openmaic-local"
OPENMAIC_PID=""
COURSE_PID=""

cleanup() {
  if [[ -n "${OPENMAIC_PID}" ]]; then kill "${OPENMAIC_PID}" 2>/dev/null || true; fi
  if [[ -n "${COURSE_PID}" ]]; then kill "${COURSE_PID}" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

if ! lsof -nP -iTCP:3100 -sTCP:LISTEN >/dev/null 2>&1; then
  if launchctl print "${OPENMAIC_SERVICE}" >/dev/null 2>&1; then
    launchctl kickstart -k "${OPENMAIC_SERVICE}"
  else
    "${OPENMAIC_START}" >>/tmp/ai-org-openmaic.log 2>&1 &
    OPENMAIC_PID=$!
  fi
fi

if ! lsof -nP -iTCP:8765 -sTCP:LISTEN >/dev/null 2>&1; then
  (
    cd "${APP_DIR}"
    exec python3 server.py
  ) >>/tmp/ai-org-course-site.log 2>&1 &
  COURSE_PID=$!
fi

echo "正在等待课程站与 OpenMAIC……"
for _ in {1..60}; do
  if curl -fsS http://127.0.0.1:8765/teaching.html >/dev/null 2>&1 \
    && curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    open http://127.0.0.1:8765/teaching.html
    if [[ -z "${OPENMAIC_PID}" && -z "${COURSE_PID}" ]]; then
      echo "学习平台已打开。服务由 macOS 后台保持运行。"
      exit 0
    fi
    echo "学习平台已打开。关闭此窗口会停止由本脚本临时启动的服务。"
    wait
    exit 0
  fi
  sleep 1
done

echo "平台未在 60 秒内就绪。请检查：" >&2
echo "  /tmp/ai-org-openmaic.log" >&2
echo "  /tmp/ai-org-course-site.log" >&2
exit 1
