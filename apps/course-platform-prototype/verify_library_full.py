import io
import json
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:8765"
APP_DIR = Path(__file__).resolve().parent
LIBRARY_DIR = APP_DIR.parents[2] / "课程的参考文献"
TEST_NAME = "__课程知识库上传闭环测试__.md"
TEST_CONTENT = "# 上传闭环测试\n\n这是自动化测试文件，用于验证上传、索引、在线阅读与下载。\n"
OUT = APP_DIR / "verification-library-full"
OUT.mkdir(exist_ok=True)


def get_json(path):
    with urllib.request.urlopen(BASE + path, timeout=120) as response:
        return response.status, json.load(response)


def request(path, method="GET", data=None, headers=None):
    return urllib.request.urlopen(
        urllib.request.Request(BASE + path, method=method, data=data, headers=headers or {}),
        timeout=120,
    )


def encoded(name):
    return urllib.parse.urlencode({"file": name})


original_status, original = get_json("/api/library")
assert original_status == 200
assert len(original["items"]) == 19 and original["files"] == 26

failures = []
for item in original["items"]:
    query = encoded(item["file"])
    for endpoint in ("/api/text?", "/api/document?", "/api/download?"):
        try:
            with request(endpoint + query) as response:
                assert response.status == 200
                assert response.read(64)
        except Exception as exc:
            failures.append((item["file"], endpoint, repr(exc)))
assert not failures, failures

archive_bytes = request("/api/download-all").read()
with zipfile.ZipFile(io.BytesIO(archive_bytes)) as archive:
    names = set(archive.namelist())
assert all(filename in names for item in original["items"] for filename in item["files"])

test_path = LIBRARY_DIR / TEST_NAME
test_path.unlink(missing_ok=True)
try:
    with request(
        "/api/upload",
        method="POST",
        data=TEST_CONTENT.encode(),
        headers={"X-Filename": urllib.parse.quote(TEST_NAME), "Content-Type": "application/octet-stream"},
    ) as response:
        uploaded = json.load(response)
        assert response.status == 201 and uploaded["uploaded"] == TEST_NAME

    _, after_upload = get_json("/api/library")
    assert len(after_upload["items"]) == 20 and after_upload["files"] == 27
    assert any(item["file"] == TEST_NAME for item in after_upload["items"])

    _, text = get_json("/api/text?" + encoded(TEST_NAME))
    assert "上传闭环测试" in text["text"]
    with request("/api/download?" + encoded(TEST_NAME)) as response:
        assert response.read().decode() == TEST_CONTENT

    try:
        request(
            "/api/upload",
            method="POST",
            data=TEST_CONTENT.encode(),
            headers={"X-Filename": urllib.parse.quote(TEST_NAME), "Content-Type": "application/octet-stream"},
        )
        raise AssertionError("duplicate upload unexpectedly succeeded")
    except urllib.error.HTTPError as exc:
        assert exc.code == 409

    try:
        request(
            "/api/upload",
            method="POST",
            data=b"unsafe",
            headers={"X-Filename": urllib.parse.quote("../unsafe.md"), "Content-Type": "application/octet-stream"},
        )
        raise AssertionError("unsafe upload unexpectedly succeeded")
    except urllib.error.HTTPError as exc:
        assert exc.code == 400

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        )
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        errors = []
        page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.goto(BASE + "/knowledge.html", wait_until="networkidle")
        assert page.locator(".library-item").count() == 20
        assert "20 项资料 · 27 个文件" in page.locator("#library-count").inner_text()
        test_item = page.locator(".library-item").filter(has_text="课程知识库上传闭环测试")
        test_item.locator("a", has_text="在线阅读").click()
        page.wait_for_selector(".document-text.visible")
        assert "上传闭环测试" in page.locator("#document-text").inner_text()
        assert "资料不存在" not in page.locator("body").inner_text()
        page.screenshot(path=str(OUT / "uploaded-document-reader.png"), full_page=False)

        page.goto(BASE + "/knowledge.html", wait_until="networkidle")
        for index in range(page.locator(".library-item").count()):
            item = page.locator(".library-item").nth(index)
            if "课程知识库上传闭环测试" in item.inner_text():
                continue
            href = item.locator("a", has_text="在线阅读").get_attribute("href")
            reader = browser.new_page(viewport={"width": 1280, "height": 800})
            reader.goto(BASE + "/" + href, wait_until="domcontentloaded")
            reader.wait_for_function(
                "document.querySelector('#reader-status').hidden || !document.querySelector('#reader-status').textContent.includes('正在读取')",
                timeout=120_000,
            )
            assert "资料不存在" not in reader.locator("body").inner_text(), href
            assert reader.locator(".pdf-frame.visible, .document-text.visible").count() == 1, href
            reader.close()
        browser.close()
        assert not errors, errors
finally:
    test_path.unlink(missing_ok=True)

_, restored = get_json("/api/library")
assert len(restored["items"]) == 19 and restored["files"] == 26
print("Library full verification passed: 19 items, 26 files, 57 endpoints, archive, upload, read, download, duplicate/path protection, all browser readers")
