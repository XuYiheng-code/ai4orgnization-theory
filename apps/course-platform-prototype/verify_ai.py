import json
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:8765"
OUT = Path(__file__).resolve().parent / "verification-ai"
OUT.mkdir(exist_ok=True)


def post(path, payload):
    request = urllib.request.Request(
        BASE + path,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.status, json.load(response)


with urllib.request.urlopen(BASE + "/api/ai-status", timeout=10) as response:
    status = json.load(response)
assert status["configured"] is True
assert status["model"] == "qwen-plus"
assert status["credentialSource"] in {"keychain", "environment"}

translate_status, translated = post(
    "/api/translate",
    {"text": "Organizations are systems of coordinated action."},
)
assert translate_status == 200
assert any("\u4e00" <= character <= "\u9fff" for character in translated["answer"])

question = "这段资料如何理解组织？请用两句话回答。"
context = "Organizations are systems of coordinated action. Decision premises shape organizational behavior."
ask_status, first = post("/api/ask", {"question": question, "context": context, "history": []})
assert ask_status == 200 and len(first["answer"]) > 10
follow_status, follow = post(
    "/api/ask",
    {
        "question": "请沿用上一轮回答，再说明决策前提的作用。",
        "context": context,
        "history": [
            {"role": "user", "content": question},
            {"role": "assistant", "content": first["answer"]},
        ],
    },
)
assert follow_status == 200 and len(follow["answer"]) > 10

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    )
    page = browser.new_page(viewport={"width": 1440, "height": 960})
    library = page.request.get(BASE + "/api/library").json()["items"]
    item = next(item for item in library if "Great Writers on Organizations" in item["title"])
    page.goto(
        f"{BASE}/reader.html?file={item['file']}&title={item['title']}",
        wait_until="networkidle",
    )
    page.wait_for_selector(".document-text.visible")
    page.locator("#toggle-ai").click()
    page.locator("#ask-input").fill("概括当前资料的核心观点，不超过三句话。")
    page.locator("#chat-form").evaluate("form => form.requestSubmit()")
    page.wait_for_function(
        "document.querySelectorAll('.chat-message.assistant').length >= 2",
        timeout=120_000,
    )
    answer = page.locator(".chat-message.assistant").last.inner_text()
    assert len(answer) > 10
    assert all(term not in answer for term in ("尚未配置", "暂时不可用", "无法连接"))
    page.screenshot(path=str(OUT / "reader-ai-live.png"), full_page=False)
    browser.close()

print("AI verification passed: keychain, qwen-plus, translation, first answer, follow-up context, reader UI")
