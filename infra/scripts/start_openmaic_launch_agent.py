#!/usr/bin/env python3
"""Launch OpenMAIC for launchd without persisting the model credential."""

from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


PROJECT_DIR = Path(__file__).resolve().parents[2]
OPENMAIC_DIR = PROJECT_DIR / "apps" / "openmaic"
KEYCHAIN_SERVICE = "ai-org-course-dashscope"
NPX = "/opt/homebrew/bin/npx"


def main() -> None:
    credential = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
        check=False,
        capture_output=True,
        text=True,
    )
    api_key = credential.stdout.strip()
    if credential.returncode != 0 or not api_key:
        print(
            f"钥匙串中未找到 {KEYCHAIN_SERVICE}。未启动 OpenMAIC。",
            file=sys.stderr,
            flush=True,
        )
        raise SystemExit(1)

    env = os.environ.copy()
    # OpenMAIC configures text generation and speech generation as separate
    # providers. Both use the same DashScope credential, but the TTS provider
    # is discovered only when the official TTS_QWEN_API_KEY variable exists.
    env["QWEN_API_KEY"] = api_key
    env["TTS_QWEN_API_KEY"] = api_key
    env["SEARXNG_BASE_URL"] = "http://127.0.0.1:8888"
    env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

    os.chdir(OPENMAIC_DIR)
    command = [
        NPX,
        "-y",
        "node@22",
        "node_modules/next/dist/bin/next",
        "dev",
        # Turbopack in Next 16.1 can retain an invalid module graph after
        # dependency rebuilds and then return 500 for every page. The local
        # classroom prioritizes recoverability over hot-reload speed, so use
        # the stable webpack dev pipeline for the persistent launch agent.
        "--webpack",
        "-H",
        "127.0.0.1",
        "-p",
        "3100",
    ]
    os.execve(NPX, command, env)


if __name__ == "__main__":
    main()
