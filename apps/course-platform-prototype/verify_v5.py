from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"
OUT = Path(__file__).resolve().parent / "verification-v5"
OUT.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    page = browser.new_page(viewport={"width": 1440, "height": 960}, accept_downloads=True)
    page.on("console", lambda msg: errors.append(f"console:{msg.type}:{msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror:{exc}"))

    pages = ["index.html", "syllabus.html", "textbooks.html", "knowledge.html", "teaching.html", "about.html"]
    for path in pages:
        page.goto(f"{BASE}/{path}", wait_until="networkidle")
        assert page.locator(".nav-link").count() == 6
        assert page.locator(".nav-link.active").count() == 1
        assert page.locator(".brand-logo").evaluate("img => img.complete && img.naturalWidth > 0")

    page.goto(f"{BASE}/index.html", wait_until="networkidle")
    phases = page.locator(".phase-card h3").all_text_contents()
    assert phases == ["组织理论：解释组织", "技术嵌入：重塑结构与协作", "智能行动者：重构决策与权力", "公共治理：约束算法与责任"]
    assert page.locator(".ao-mark").evaluate("el => getComputedStyle(el).strokeWidth === '8px'")
    page.screenshot(path=str(OUT / "home-desktop.png"), full_page=True)

    page.goto(f"{BASE}/syllabus.html", wait_until="networkidle")
    assert page.locator("details.week").count() == 16
    assert page.locator(".week-intro").count() == 16
    page.locator("details.week").nth(15).locator("summary").click()
    assert "整合全课理论" in page.locator("details.week").nth(15).inner_text()
    page.screenshot(path=str(OUT / "syllabus-desktop.png"), full_page=True)

    page.goto(f"{BASE}/knowledge.html", wait_until="networkidle")
    library_response = page.request.get(f"{BASE}/api/library")
    assert library_response.ok
    library_items = library_response.json()["items"]
    assert library_items
    assert page.locator(".library-item").count() == len(library_items)
    assert page.locator(".lib-actions a").count() == len(library_items) * 2
    assert page.locator("#download-all").is_visible()
    assert page.locator(".library-item").first.locator("a", has_text="在线阅读").get_attribute("href").startswith("reader.html?")
    response = page.request.get(f"{BASE}/api/download?file=Organizations%20March%2CSimon.md")
    assert response.ok and len(response.body()) > 500_000
    blocked = page.request.get(f"{BASE}/api/download?file=..%2F0812%20AI_and_Organization_Syllabus_Draft.md")
    assert blocked.status == 404
    assert page.request.get(f"{BASE}/server.py").status == 404
    assert page.request.get(f"{BASE}/verify_v5.py").status == 404
    page.screenshot(path=str(OUT / "knowledge-desktop.png"), full_page=True)

    reader_url = page.locator(".library-item").first.locator("a", has_text="在线阅读").get_attribute("href")
    page.goto(f"{BASE}/{reader_url}", wait_until="networkidle")
    page.wait_for_selector(".document-text.visible")
    assert page.locator(".document-text p").count() > 10
    page.locator('[data-reader-tab="ask"]').click()
    page.locator("#ask-input").fill("概括核心论点")
    page.locator("#ask-button").click()
    page.wait_for_function("document.querySelector('#ask-answer').textContent.includes('尚未配置')")
    page.screenshot(path=str(OUT / "reader-markdown.png"), full_page=False)

    page.goto(f"{BASE}/reader.html?file=bcg-%E6%9C%AA%E6%9D%A5%E5%B7%B2%E6%9D%A5-ai%E7%BB%84%E7%BB%87%E8%BF%9B%E5%8C%96%E8%AE%BA-cn-aug-2024.pdf&title=BCG", wait_until="networkidle")
    page.wait_for_selector(".pdf-frame.visible")
    assert page.locator(".pdf-frame").get_attribute("src").startswith("/api/document")

    page.goto(f"{BASE}/about.html", wait_until="networkidle")
    assert page.locator("#teacher-name").inner_text() == "于君博"
    assert "南京大学政府管理学院教授" in page.locator(".teacher-role").inner_text()
    assert page.locator(".teacher-photo img").evaluate("img => img.complete && img.naturalWidth > 800")
    assert page.locator(".roadmap-grid article").count() == 4
    page.screenshot(path=str(OUT / "about-desktop.png"), full_page=True)

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    for path in pages + [reader_url]:
        mobile.goto(f"{BASE}/{path}", wait_until="networkidle")
        assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), path
    mobile.goto(f"{BASE}/knowledge.html", wait_until="networkidle")
    mobile.screenshot(path=str(OUT / "knowledge-mobile.png"), full_page=True)
    browser.close()

unexpected_errors = [error for error in errors if "503 (Service Unavailable)" not in error]
if unexpected_errors:
    raise AssertionError("Browser errors: " + " | ".join(unexpected_errors))
print("V5 verification passed: 6 pages, refined logo, 4 distinct stages, 16 introductions, library downloads, reader, Qwen guard, teacher profile, roadmap, mobile")
