#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8765}"

check_path() {
  local path="$1"
  local expected="$2"
  local body
  body="$(curl --fail --silent --show-error --max-time 15 "${BASE_URL}${path}")"
  if [[ "${body}" != *"${expected}"* ]]; then
    echo "检查失败：${path} 未出现 ${expected}" >&2
    exit 1
  fi
  echo "通过：${path}"
}

check_path "/index.html" "人工智能与组织管理"
check_path "/syllabus.html" "课程大纲"
check_path "/textbooks.html" "课程教材"
check_path "/about.html" "关于课程"
check_path "/api/library" '"items"'

echo "基础发布检查通过：${BASE_URL}"

