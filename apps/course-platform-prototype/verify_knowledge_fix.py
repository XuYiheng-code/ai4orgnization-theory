from pathlib import Path

from playwright.sync_api import sync_playwright


APP_DIR = Path(__file__).resolve().parent
BASE = "http://127.0.0.1:8765"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )
    page = browser.new_page(viewport={"width": 1440, "height": 960})

    page.goto(BASE + "/index.html", wait_until="networkidle")
    home_text = page.locator("main").inner_text()
    assert "四个阶段依次推进。每周主题、理论框架与课堂活动均以课程大纲为准。" not in home_text
    assert "首页只保留最常用的三个入口。其他内容可从顶部栏目进入。" not in home_text

    page.goto(BASE + "/knowledge.html", wait_until="networkidle")
    assert page.locator(".library-item").count() == 19
    assert "19 项资料 · 26 个文件" in page.locator("#library-count").inner_text()
    assert "无法读取资料目录" not in page.locator("body").inner_text()

    page.goto((APP_DIR / "knowledge.html").as_uri(), wait_until="networkidle")
    assert page.url == BASE + "/knowledge.html"
    assert page.locator(".library-item").count() == 19
    assert "19 项资料 · 26 个文件" in page.locator("#library-count").inner_text()

    browser.close()

print("Knowledge fix passed: home copy removed, 19/26 library loaded, file URL redirected to persistent service")
