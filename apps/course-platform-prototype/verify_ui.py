from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765"
OUT = Path(__file__).resolve().parent / "verification-v4"
OUT.mkdir(exist_ok=True)
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    page.on("console", lambda msg: errors.append(f"console:{msg.type}:{msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"pageerror:{exc}"))

    pages = {
        "index.html": "人工智能与组织管理｜课程主页",
        "syllabus.html": "课程大纲｜人工智能与组织管理",
        "textbooks.html": "课程教材｜人工智能与组织管理",
        "knowledge.html": "知识广场｜人工智能与组织管理",
        "teaching.html": "教学平台｜人工智能与组织管理",
        "about.html": "关于｜人工智能与组织管理",
    }
    for path, title in pages.items():
        page.goto(f"{BASE}/{path}", wait_until="networkidle")
        assert page.title() == title
        assert "logo-c-ao-monogram.png" not in page.content()
        assert "course-logo-official.png" not in page.content()
        assert page.locator('img[src*="course-logo-v2.svg"]').count() >= 1
        assert page.locator(".nav-link").count() == 6
        assert page.locator(".nav-link.active").count() == 1
        assert page.locator(".brand-logo").evaluate("img => img.complete && img.naturalWidth > 0")
        assert page.locator('img[src*="course-logo-v2.svg"]').evaluate_all("imgs => imgs.every(img => img.complete && img.naturalWidth > 0)")
        heading = page.locator("h1").first
        assert heading.evaluate("el => { const s = getComputedStyle(el); return el.getBoundingClientRect().height <= parseFloat(s.lineHeight) * 1.2; }"), f"wrapped desktop page title: {path}"

    page.goto(f"{BASE}/index.html", wait_until="networkidle")
    assert page.locator(".entry-card").count() == 3
    assert page.locator(".phase-card").count() == 4
    assert page.locator("text=制作规划").count() == 0
    assert page.locator(".assembly-logo").count() == 1
    assert page.locator(".logo-piece").count() == 6
    assert page.locator(".home-intro").count() == 0
    assert page.locator("text=六个组织节点").count() == 0
    page.locator("[data-logo-replay]").click()
    assert page.locator(".logo-lab").evaluate("el => el.classList.contains('is-assembling')")
    page.wait_for_timeout(900)
    page.screenshot(path=str(OUT / "logo-assembly-process.png"))
    page.wait_for_timeout(2100)
    page.screenshot(path=str(OUT / "home-desktop.png"), full_page=True)

    file_url = (Path(__file__).resolve().parent / "index.html").as_uri()
    page.goto(file_url, wait_until="load")
    page.wait_for_timeout(3000)
    assert page.locator(".assembly-logo").is_visible()
    assert page.locator(".brand-logo").evaluate("img => img.complete && img.naturalWidth > 0")
    assert page.locator(".logo-piece").count() == 6
    page.screenshot(path=str(OUT / "home-file-protocol.png"), full_page=False)

    teaching_file_url = (Path(__file__).resolve().parent / "teaching.html").as_uri()
    page.goto(teaching_file_url, wait_until="load")
    assert page.locator('img[src="course-logo-v2.svg"]').evaluate_all("imgs => imgs.every(img => img.complete && img.naturalWidth > 0)")
    page.screenshot(path=str(OUT / "teaching-file-protocol.png"), full_page=False)

    page.goto(f"{BASE}/syllabus.html", wait_until="networkidle")
    assert page.locator("details.week").count() == 16
    assert "导论课" in page.locator("details.week").nth(0).inner_text()
    assert "期末报告展示" in page.locator("details.week").nth(15).inner_text()
    page.locator("details.week").nth(8).locator("summary").click()
    assert page.locator("details.week").nth(8).get_attribute("open") is not None
    page.screenshot(path=str(OUT / "syllabus-desktop.png"), full_page=True)

    page.goto(f"{BASE}/knowledge.html", wait_until="networkidle")
    page.screenshot(path=str(OUT / "knowledge-desktop.png"), full_page=True)
    page.locator("#library-search").fill("March")
    assert page.locator(".library-item").count() == 1
    page.locator("#library-search").fill("")
    page.locator('[data-concept="technology"]').click()
    assert page.locator(".library-item").count() >= 2

    page.goto(f"{BASE}/teaching.html", wait_until="networkidle")
    page.locator('[data-role="teacher"]').click()
    page.locator("#demo-login-form").evaluate("form => form.requestSubmit()")
    assert page.locator("#dashboard").is_visible()
    assert page.locator('[data-view="teacher"]').is_visible()
    page.screenshot(path=str(OUT / "teaching-desktop.png"), full_page=True)

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.on("console", lambda msg: errors.append(f"mobile-console:{msg.type}:{msg.text}") if msg.type == "error" else None)
    mobile.on("pageerror", lambda exc: errors.append(f"mobile-pageerror:{exc}"))
    for path in pages:
        mobile.goto(f"{BASE}/{path}", wait_until="networkidle")
        heading = mobile.locator("h1").first
        assert heading.evaluate("el => { const s = getComputedStyle(el); return el.getBoundingClientRect().height <= parseFloat(s.lineHeight) * 1.2; }"), f"wrapped mobile page title: {path}"
        fits = mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
        if not fits:
            overflow = mobile.evaluate("""[...document.querySelectorAll('*')].filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0,8).map(el => ({tag:el.tagName, cls:el.className, right:el.getBoundingClientRect().right, width:el.getBoundingClientRect().width}))""")
            raise AssertionError(f"mobile overflow in {path}: {overflow}")
    mobile.goto(f"{BASE}/index.html", wait_until="networkidle")
    mobile.locator(".menu-button").click()
    assert mobile.locator(".nav").evaluate("el => el.classList.contains('open')")
    mobile.screenshot(path=str(OUT / "home-mobile.png"), full_page=True)
    browser.close()

if errors:
    raise AssertionError("Browser errors: " + " | ".join(errors))

print("V4 verification passed: 6 pages, SVG logo, file protocol, single-line titles, navigation, 16 weeks, animation, interactions, mobile, console")
