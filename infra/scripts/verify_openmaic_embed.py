#!/usr/bin/env python3
"""Verify that the course site's teaching iframe can load local OpenMAIC."""

from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


COURSE_URL = "http://127.0.0.1:8765/teaching.html"
EXPECTED_OPENMAIC_URL = "http://127.0.0.1:3100/"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SCREENSHOT = Path("/tmp/openmaic-embed-recovered.png")


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=CHROME, headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.goto(COURSE_URL, wait_until="networkidle")

        iframe = page.locator("iframe.maic-frame")
        iframe.wait_for(state="visible")
        frame = next(
            (candidate for candidate in page.frames if candidate.url.startswith(EXPECTED_OPENMAIC_URL)),
            None,
        )
        if frame is None:
            raise RuntimeError("OpenMAIC iframe did not create a content frame")
        frame.wait_for_load_state("networkidle")
        frame.locator("body").wait_for(state="visible")

        frame_url = frame.url
        body_text = frame.locator("body").inner_text().strip()
        if not frame_url.startswith(EXPECTED_OPENMAIC_URL):
            raise RuntimeError(f"Unexpected iframe URL: {frame_url}")
        if not body_text:
            raise RuntimeError("OpenMAIC iframe rendered an empty body")

        page.screenshot(path=str(SCREENSHOT), full_page=True)
        print(
            json.dumps(
                {
                    "success": True,
                    "courseUrl": page.url,
                    "iframeUrl": frame_url,
                    "iframeTextLength": len(body_text),
                    "screenshot": str(SCREENSHOT),
                },
                ensure_ascii=False,
            )
        )
        browser.close()


if __name__ == "__main__":
    main()
