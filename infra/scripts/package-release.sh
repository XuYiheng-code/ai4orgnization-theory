#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../../.." && pwd)"
INFRA_DIR="${PROJECT_ROOT}/线上教学课程平台的智能体建设/infra"
APP_SOURCE="${PROJECT_ROOT}/线上教学课程平台的智能体建设/apps/course-platform-prototype"
LIBRARY_SOURCE="${PROJECT_ROOT}/课程的参考文献"
ARTIFACT_DIR="${INFRA_DIR}/artifacts"
RELEASE_ID="$(date +%Y%m%d-%H%M%S)"
STAGING_DIR="$(mktemp -d)"
ARCHIVE="${ARTIFACT_DIR}/course-site-${RELEASE_ID}.tar.gz"

cleanup() {
  rm -rf -- "${STAGING_DIR}"
}
trap cleanup EXIT

mkdir -p -- "${ARTIFACT_DIR}" "${STAGING_DIR}/apps/course-platform-prototype" "${STAGING_DIR}/课程的参考文献"

rsync -a \
  --exclude '__pycache__/' \
  --exclude 'verification/' \
  --exclude 'verification-v*/' \
  --exclude 'verify*.py' \
  --exclude '*.env' \
  --exclude '.DS_Store' \
  "${APP_SOURCE}/" "${STAGING_DIR}/apps/course-platform-prototype/"

# 首版只复制明确列入公开清单的资料。每行一个文件名；不存在的文件会使打包失败。
PUBLIC_MANIFEST="${INFRA_DIR}/public-library-manifest.txt"
if [[ -s "${PUBLIC_MANIFEST}" ]]; then
  while IFS= read -r file_name; do
    [[ -z "${file_name}" || "${file_name}" == \#* ]] && continue
    if [[ ! -f "${LIBRARY_SOURCE}/${file_name}" ]]; then
      echo "公开资料不存在：${file_name}" >&2
      exit 1
    fi
    cp -p -- "${LIBRARY_SOURCE}/${file_name}" "${STAGING_DIR}/课程的参考文献/"
  done < "${PUBLIC_MANIFEST}"
fi

printf '%s\n' "${RELEASE_ID}" > "${STAGING_DIR}/RELEASE_ID"
tar -C "${STAGING_DIR}" -czf "${ARCHIVE}" .
shasum -a 256 "${ARCHIVE}" > "${ARCHIVE}.sha256"

echo "发布包：${ARCHIVE}"
echo "校验文件：${ARCHIVE}.sha256"
