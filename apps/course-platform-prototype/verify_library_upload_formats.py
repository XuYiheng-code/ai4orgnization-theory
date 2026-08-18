import tempfile
import zipfile
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:8765"
APP_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = APP_DIR.parents[2] / "课程的参考文献"
TEST_FILES = {
    "__上传格式测试_PDF__.pdf": "PDF upload and reader test",
    "__上传格式测试_Markdown__.md": "# Markdown upload and reader test",
    "__上传格式测试_Word__.docx": "Word upload and reader test",
    "__上传格式测试_TXT__.txt": "TXT upload and reader test",
}


def make_docx(path, text):
    document = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>'''
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("word/document.xml", document)


for name in TEST_FILES:
    (LIBRARY_DIR / name).unlink(missing_ok=True)

with tempfile.TemporaryDirectory() as temporary_directory:
    temporary = Path(temporary_directory)
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((72, 72), TEST_FILES["__上传格式测试_PDF__.pdf"])
    pdf.save(temporary / "__上传格式测试_PDF__.pdf")
    pdf.close()
    (temporary / "__上传格式测试_Markdown__.md").write_text(TEST_FILES["__上传格式测试_Markdown__.md"], encoding="utf-8")
    make_docx(temporary / "__上传格式测试_Word__.docx", TEST_FILES["__上传格式测试_Word__.docx"])
    (temporary / "__上传格式测试_TXT__.txt").write_text(TEST_FILES["__上传格式测试_TXT__.txt"], encoding="utf-8")

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            )
            page = browser.new_page(viewport={"width": 1440, "height": 960})
            page.goto(BASE + "/knowledge.html", wait_until="networkidle")
            assert page.locator(".library-item").count() == 19

            for offset, name in enumerate(TEST_FILES, start=1):
                page.locator("#library-upload-input").set_input_files(str(temporary / name))
                page.wait_for_function(
                    f"document.querySelectorAll('.library-item').length === {19 + offset}",
                    timeout=120_000,
                )
                assert name.rsplit(".", 1)[0] in page.locator("body").inner_text()

            for name in TEST_FILES:
                page.goto(BASE + "/knowledge.html", wait_until="networkidle")
                display_name = name.rsplit(".", 1)[0].replace("_", " ").strip()
                item = page.locator(".library-item").filter(has_text=display_name)
                href = item.locator("a", has_text="在线阅读").get_attribute("href")
                page.goto(BASE + "/" + href, wait_until="networkidle")
                page.wait_for_function(
                    "document.querySelector('#reader-status').hidden || !document.querySelector('#reader-status').textContent.includes('正在读取')",
                    timeout=120_000,
                )
                assert "资料不存在" not in page.locator("body").inner_text()
                if name.endswith(".pdf"):
                    assert page.locator(".pdf-frame.visible").count() == 1
                else:
                    assert page.locator(".document-text.visible").count() == 1
                    assert TEST_FILES[name].lstrip("# ") in page.locator("#document-text").inner_text()
            browser.close()
    finally:
        for name in TEST_FILES:
            (LIBRARY_DIR / name).unlink(missing_ok=True)

print("Upload format verification passed: PDF, Markdown, Word and TXT uploaded through UI and opened in reader")
