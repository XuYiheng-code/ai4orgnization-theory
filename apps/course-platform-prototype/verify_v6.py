from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"
OUT = Path(__file__).resolve().parent / "verification-v6"
OUT.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    page.on("console", lambda msg: errors.append(f"console:{msg.type}:{msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror:{exc}"))

    page.goto(f"{BASE}/index.html", wait_until="networkidle")
    assert page.locator(".course-identity img").evaluate("img => img.complete && img.naturalWidth > 500")
    assert "南京大学政府管理学院" in page.locator(".course-identity").inner_text()
    assert "2026—2027 学年本科生课程" in page.locator(".course-identity").inner_text()
    smart_title = page.locator(".phase-card").nth(2).locator("h3")
    assert smart_title.evaluate("el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) * 1.2")
    page.screenshot(path=str(OUT / "home-desktop.png"), full_page=True)

    page.goto(f"{BASE}/about.html", wait_until="networkidle")
    teacher = page.locator(".teacher-profile")
    assert teacher.evaluate("el => el.getBoundingClientRect().width <= 970")
    assert page.locator(".teacher-photo").evaluate("el => el.getBoundingClientRect().height <= 316")
    page.screenshot(path=str(OUT / "about-desktop.png"), full_page=True)

    api = page.request.get(f"{BASE}/api/library")
    assert api.ok
    data = api.json()
    assert data["files"] == 26
    assert len(data["items"]) == 19
    assert sum(len(item["files"]) for item in data["items"]) == 26
    page.goto(f"{BASE}/knowledge.html", wait_until="networkidle")
    assert page.locator(".library-item").count() == 19
    assert "19 项资料 · 26 个文件" in page.locator("#library-count").inner_text()
    assert page.locator(".lib-actions a").count() == 38
    page.screenshot(path=str(OUT / "knowledge-desktop.png"), full_page=True)

    reader_url = page.locator(".library-item").filter(has_text="Great Writers on Organizations").locator("a", has_text="在线阅读").get_attribute("href")
    page.goto(f"{BASE}/{reader_url}", wait_until="networkidle")
    page.wait_for_selector(".document-text.visible")
    assert page.locator(".reader-pane").count() == 3
    assert page.locator("#translation-pane").is_hidden()
    assert page.locator("#ai-pane").is_hidden()
    page.locator("#toggle-translation").click()
    assert page.locator("#translation-pane").is_visible()
    assert page.locator("#reader-workspace").evaluate("el => el.classList.contains('translation-open')")
    page.locator("#translate-current").click()
    page.wait_for_function("document.querySelector('#translation-result').textContent !== '正在翻译……'", timeout=120_000)
    page.locator("#toggle-ai").click()
    assert page.locator("#ai-pane").is_visible()
    page.locator("#ask-input").fill("概括核心观点")
    page.locator("#chat-form").evaluate("form => form.requestSubmit()")
    page.wait_for_function("document.querySelectorAll('.chat-message').length >= 3")
    assert page.locator(".chat-message.user").count() == 1
    assert page.locator(".chat-message.assistant").count() == 2
    page.screenshot(path=str(OUT / "reader-three-pane.png"), full_page=False)

    blocked = page.request.get(f"{BASE}/api/download?file=..%2F0812%20AI_and_Organization_Syllabus_Draft.md")
    assert blocked.status == 404

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    for path in ("index.html", "about.html", "knowledge.html"):
        mobile.goto(f"{BASE}/{path}", wait_until="networkidle")
        assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), path
    mobile.goto(f"{BASE}/{reader_url}", wait_until="networkidle")
    mobile.locator("#toggle-translation").click()
    mobile.locator("#toggle-ai").click()
    assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    mobile.screenshot(path=str(OUT / "reader-mobile.png"), full_page=True)
    browser.close()

if errors:
    raise AssertionError("Browser errors: " + " | ".join(errors))
print("V6 passed: one-line stage title, compact teacher, 19/26 library, dynamic indexing, parallel translation, multi-turn AI pane, official logo, mobile")
