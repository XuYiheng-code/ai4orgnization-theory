from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:8765"
OUT = Path(__file__).resolve().parent / "verification-home-cover"
OUT.mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )

    for width, height, filename in (
        (2048, 1200, "home-cover-2048.png"),
        (1440, 960, "home-cover-1440.png"),
    ):
        page = browser.new_page(viewport={"width": width, "height": height})
        page.goto(BASE + "/index.html", wait_until="networkidle")
        header = page.locator(".site-header").bounding_box()
        identity = page.locator(".course-identity").bounding_box()
        title = page.locator(".home-title").bounding_box()
        lead = page.locator(".home-lead").bounding_box()
        team = page.locator(".course-team").bounding_box()
        actions = page.locator(".hero-actions").bounding_box()
        meta = page.locator(".hero-meta").bounding_box()
        copy = page.locator(".home-copy").bounding_box()
        logo = page.locator(".hero-logo-wrap").bounding_box()
        assert identity["y"] > header["y"] + header["height"] + 100
        assert identity["y"] < (340 if width == 2048 else 245)
        assert identity["y"] < title["y"] < lead["y"] < team["y"] < actions["y"] < meta["y"]
        glyph_width = page.locator(".home-title").evaluate(
            "el => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect().width; }"
        )
        assert glyph_width < copy["width"] * .9
        assert abs((title["y"] + title["height"] / 2) - (logo["y"] + logo["height"] / 2)) < 170
        assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
        page.screenshot(path=str(OUT / filename), full_page=False)
        page.close()

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(BASE + "/index.html", wait_until="networkidle")
    logo = mobile.locator(".hero-logo-wrap").bounding_box()
    identity = mobile.locator(".course-identity").bounding_box()
    assert logo["y"] < identity["y"]
    assert identity["y"] > logo["y"] + logo["height"]
    assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    mobile.screenshot(path=str(OUT / "home-cover-mobile.png"), full_page=True)
    browser.close()

print("Home cover layout passed: raised identity, balanced columns, desktop/tablet/mobile overflow")
