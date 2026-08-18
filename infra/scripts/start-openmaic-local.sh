#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OPENMAIC_DIR="${PROJECT_DIR}/apps/openmaic"
KEYCHAIN_SERVICE="ai-org-course-dashscope"

if ! command -v security >/dev/null 2>&1; then
  echo "无法访问 macOS Keychain。请通过 QWEN_API_KEY 环境变量启动。" >&2
  exit 1
fi

QWEN_API_KEY="$(security find-generic-password -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null || true)"
if [[ -z "${QWEN_API_KEY}" ]]; then
  echo "钥匙串中未找到 ${KEYCHAIN_SERVICE}。未启动 OpenMAIC。" >&2
  exit 1
fi
export QWEN_API_KEY

cd "${OPENMAIC_DIR}"
# Pin Turbopack's root to the repository in next.config.ts. Without that root,
# Next may infer the user's home directory and panic while shortening a CJK path.
# OpenMAIC pins Node 22 in .nvmrc; use that runtime even when the parent Codex
# environment currently exposes a newer Node version.
if [[ "$(node -p 'process.versions.node.split(".")[0]')" == "22" ]]; then
  exec corepack pnpm exec next dev --webpack -H 127.0.0.1 -p 3100
fi
exec npx -y node@22 node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3100
