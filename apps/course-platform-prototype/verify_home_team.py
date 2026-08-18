from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:8765"
OUT = Path(__file__).resolve().parent / "verification-home-team"
OUT.mkdir(exist_ok=True)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )

    page = browser.new_page(viewport={"width": 2048, "height": 1200})
    page.goto(BASE + "/index.html", wait_until="networkidle")
    team = page.locator(".course-team")
    assert team.inner_text().splitlines() == ["教师：", "于君博", "助教：", "徐亦恒"]
    lead_box = page.locator(".home-lead").bounding_box()
    actions_box = page.locator(".hero-actions").bounding_box()
    team_box = team.bounding_box()
    assert team_box["y"] > lead_box["y"] + lead_box["height"] + 20
    assert actions_box["y"] > team_box["y"] + team_box["height"] + 20
    assert team_box["x"] == actions_box["x"]
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    page.screenshot(path=str(OUT / "home-team-desktop.png"), full_page=False)

    tablet = browser.new_page(viewport={"width": 900, "height": 1000})
    tablet.goto(BASE + "/index.html", wait_until="networkidle")
    assert tablet.locator(".hero-actions").bounding_box()["y"] > tablet.locator(".course-team").bounding_box()["y"]
    assert tablet.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(BASE + "/index.html", wait_until="networkidle")
    assert "于君博" in mobile.locator(".course-team").inner_text()
    assert "徐亦恒" in mobile.locator(".course-team").inner_text()
    assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    mobile.screenshot(path=str(OUT / "home-team-mobile.png"), full_page=True)
    browser.close()

print("Home team verification passed: exact names, calm vertical hierarchy, responsive overflow")
