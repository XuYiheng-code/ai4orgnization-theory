from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:8765"
OUT = Path(__file__).resolve().parent / "verification-reader-design"
OUT.mkdir(exist_ok=True)


def luminance(rgb):
    values = []
    for value in rgb:
        value /= 255
        values.append(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]


def contrast(foreground, background):
    lighter, darker = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )
    page = browser.new_page(viewport={"width": 2048, "height": 1100})
    errors = []
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(str(exc)))

    library = page.request.get(BASE + "/api/library").json()["items"]
    markdown = next(item for item in library if "Great Writers on Organizations" in item["title"])
    page.goto(
        f"{BASE}/reader.html?file={markdown['file']}&title={markdown['title']}",
        wait_until="networkidle",
    )
    page.wait_for_selector(".document-text.visible")
    page.evaluate("localStorage.clear()")
    page.locator("#toggle-translation").click()
    page.locator("#toggle-ai").click()

    colors = {}
    for name, selector in {
        "source": ".reader-document",
        "translation": ".translation-result",
        "ai": ".chat-thread",
    }.items():
        colors[name] = page.locator(selector).evaluate("el => getComputedStyle(el).backgroundColor")
    assert len(set(colors.values())) == 3, colors

    accent_colors = {}
    for name, selector in {
        "source": ".reader-source .pane-header::before",
        "translation": ".translation-pane .pane-header::before",
        "ai": ".ai-pane .pane-header::before",
    }.items():
        base_selector, pseudo = selector.split("::")
        accent_colors[name] = page.locator(base_selector).evaluate(
            f"el => getComputedStyle(el, '::{pseudo}').backgroundColor"
        )
    assert len(set(accent_colors.values())) == 3, accent_colors

    assert contrast((20, 34, 53), (255, 254, 250)) >= 4.5
    for selector in (
        ".reader-back",
        "#reader-smaller",
        "#reader-larger",
        "#toggle-translation",
        "#toggle-ai",
        ".pane-close",
        "#translate-selection",
        "#translation-prev",
        "#ask-button",
    ):
        box = page.locator(selector).first.bounding_box()
        assert box["width"] >= 44 and box["height"] >= 44, (selector, box)

    page.locator("#document-text p").first.evaluate("""paragraph => {
        const range = document.createRange();
        const node = paragraph.firstChild;
        range.setStart(node, 0);
        range.setEnd(node, Math.min(node.textContent.length, 120));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
    }""")
    page.locator("#translate-selection").click()
    page.wait_for_function(
        "document.querySelector('#translation-result').textContent !== '正在翻译……'",
        timeout=120_000,
    )
    translated = page.locator("#translation-result").inner_text()
    assert any("\u4e00" <= character <= "\u9fff" for character in translated)
    assert not any(term in translated for term in ("尚未配置", "无法连接", "暂时不可用", "请求过于频繁"))

    page.locator("#ask-input").fill("请用一个加粗小标题和两个项目符号概括当前资料。")
    page.locator("#chat-form").evaluate("form => form.requestSubmit()")
    page.wait_for_function(
        "document.querySelectorAll('.chat-message.assistant').length >= 2",
        timeout=120_000,
    )
    answer = page.locator(".chat-message.assistant").last
    assert "**" not in answer.inner_text()
    assert answer.locator("strong, li").count() >= 1
    page.screenshot(path=str(OUT / "reader-markdown-three-pane.png"), full_page=False)

    pdf = next(item for item in library if item["file"].lower().endswith(".pdf"))
    pdf_page = browser.new_page(viewport={"width": 2048, "height": 1100})
    pdf_page.goto(
        f"{BASE}/reader.html?file={pdf['file']}&title={pdf['title']}",
        wait_until="networkidle",
    )
    assert pdf_page.locator(".pdf-frame.visible").count() == 1
    assert "资料不存在" not in pdf_page.locator("body").inner_text()
    pdf_page.screenshot(path=str(OUT / "reader-pdf.png"), full_page=False)
    pdf_page.close()

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(
        f"{BASE}/reader.html?file={markdown['file']}&title={markdown['title']}",
        wait_until="networkidle",
    )
    mobile.wait_for_selector(".document-text.visible")
    mobile.locator("#toggle-translation").click()
    mobile.locator("#toggle-ai").click()
    assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    assert mobile.locator(".translation-pane").is_visible()
    assert mobile.locator(".ai-pane").is_visible()
    for selector in ("#toggle-translation", "#toggle-ai", ".pane-close"):
        box = mobile.locator(selector).first.bounding_box()
        assert box["width"] >= 44 and box["height"] >= 44, (selector, box)
    mobile.screenshot(path=str(OUT / "reader-mobile.png"), full_page=True)
    browser.close()

    assert not errors, errors

print("Reader design passed: semantic pane colors, accents, WCAG contrast, 44px targets, translation, formatted Qwen, PDF and mobile")
