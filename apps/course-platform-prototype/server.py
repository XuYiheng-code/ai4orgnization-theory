#!/usr/bin/env python3
"""Local course-platform server with safe file access and Qwen proxy."""
from __future__ import annotations

import json
import base64
import mimetypes
import os
import re
import html as _html
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict, deque
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

APP_DIR = Path(__file__).resolve().parent
PROJECT_DIR = APP_DIR.parents[2]
# 参考文献目录：默认沿用本地相对布局（PROJECT_DIR/课程的参考文献）。
# 线上部署目录结构与本地不同，故允许用环境变量 COURSE_LIBRARY_DIR 显式指向真实位置。
LIBRARY_DIR = Path(os.environ.get("COURSE_LIBRARY_DIR", str(PROJECT_DIR / "课程的参考文献")))
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
# 课程展示内容（大纲 / FILM 章节 / 课程介绍 / 入口文案）单一数据源。
# 小程序与网站共用此 JSON：在此编辑即两端同步，无需发版。
COURSE_CONTENT_FILE = DATA_DIR / "course-content.json"
ASK_UPLOAD_MAX = 20 * 1024 * 1024
SUPPORTED_ASK_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".pdf", ".md", ".txt", ".doc", ".docx"}
# OpenMAIC 真实课程落盘目录（课堂作品在此生成，广场样本从中派生）
OPENMAIC_CLASSROOMS_DIR = (
    PROJECT_DIR
    / "线上教学课程平台的智能体建设"
    / "apps"
    / "openmaic"
    / "data"
    / "classrooms"
)
USERS_FILE = DATA_DIR / "users.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"
CONVERSATIONS_FILE = DATA_DIR / "conversations.json"
HOST = "127.0.0.1"
PORT = int(os.getenv("COURSE_PORT", "8765"))
MAX_BODY = 5_000_000  # 5MB：容纳封面图片 data URL（3MB 上限 + base64 膨胀），文本类端点体积极小无影响
MAX_UPLOAD = 512 * 1024 * 1024
SUPPORTED_LIBRARY_SUFFIXES = {".pdf", ".md", ".docx", ".txt"}
KEYCHAIN_SERVICE = "ai-org-course-dashscope"
AI_RATE_LIMIT = max(1, int(os.getenv("COURSE_AI_RATE_LIMIT", "20")))
AI_RATE_WINDOW_SECONDS = 60
_AI_REQUESTS = defaultdict(deque)
_AI_REQUESTS_LOCK = threading.Lock()


def dashscope_api_key():
    """Return the server-side API key without ever exposing it to the browser."""
    env_key = os.getenv("DASHSCOPE_API_KEY", "").strip()
    if env_key:
        return env_key, "environment"
    if os.getenv("COURSE_DISABLE_KEYCHAIN", "").strip().lower() in {"1", "true", "yes"}:
        return "", ""
    security = shutil.which("security")
    if not security:
        return "", ""
    try:
        completed = subprocess.run(
            [security, "find-generic-password", "-s", KEYCHAIN_SERVICE, "-w"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return "", ""
    key = completed.stdout.strip() if completed.returncode == 0 else ""
    return (key, "keychain") if key else ("", "")


def ai_request_allowed(client_ip):
    now = time.monotonic()
    with _AI_REQUESTS_LOCK:
        recent = _AI_REQUESTS[client_ip]
        while recent and now - recent[0] >= AI_RATE_WINDOW_SECONDS:
            recent.popleft()
        if len(recent) >= AI_RATE_LIMIT:
            return False
        recent.append(now)
    return True


def normalized_stem(path: Path) -> str:
    stem = path.stem.casefold().strip()
    for suffix in ("_html整理版", "-html整理版", " html整理版"):
        if stem.endswith(suffix):
            stem = stem[:-len(suffix)].rstrip(" _-")
    return stem
PUBLIC_FILES = {
    "/index.html",
    "/syllabus.html",
    "/textbooks.html",
    "/knowledge.html",
    "/references.html",
    "/projects.html",
    "/viewer.html",
    "/viewer.js",
    "/login.html",
    "/login.js",
    "/teaching.html",
    "/about.html",
    "/reader.html",
    "/book-guide.html",
    "/app.js",
    "/styles.css",
    "/course-logo-v2.svg",
    "/assets/nju-government-logo.png",
    "/assets/yujunbo.jpg",
    "/assets/course-promo.mp4",
    "/assets/course-promo.webm",
    "/assets/course-promo-poster.png",
    "/assets/guide-organizations-ch1-1.mp4",
    "/assets/splash-intro.mp4",
}


def classify_document(path: Path):
    name = path.stem.lower()
    if any(term in name for term in ("handbook", "sage", "oxford")):
        doc_type, label = "handbook", "研究手册"
    elif any(term in name for term in ("组织", "organizations", "writers", "summary")) and not any(term in name for term in ("ai", "智能", "前线")):
        doc_type, label = "classic", "经典著作"
    else:
        doc_type, label = "frontier", "前沿材料"
    concept_terms = {
        "decision": ("decision", "simon", "决策", "理性"),
        "institution": ("institution", "制度", "organization theory", "组织理论"),
        "process": ("process", "change", "historical", "过程", "变革", "历史"),
        "technology": ("technology", "media", "ai", "智能", "技术", "工程师"),
        "public": ("public", "government", "政府", "公共", "行政"),
    }
    concepts = [key for key, terms in concept_terms.items() if any(term in name for term in terms)] or ["institution"]
    return doc_type, label, concepts


def library_items():
    grouped = {}
    if not LIBRARY_DIR.is_dir():
        # 目录缺失时优雅降级为空列表，避免请求处理未捕获异常导致 nginx 502。
        return []
    for path in sorted(LIBRARY_DIR.iterdir(), key=lambda item: item.name.casefold()):
        if not path.is_file() or path.name.startswith(".") or path.suffix.lower() not in SUPPORTED_LIBRARY_SUFFIXES:
            continue
        key = normalized_stem(path)
        group = grouped.setdefault(key, [])
        group.append(path)
    items = []
    counters = {"classic": 0, "handbook": 0, "frontier": 0}
    prefixes = {"classic": "CL", "handbook": "HB", "frontier": "FR"}
    for paths in grouped.values():
        preferred = next((path for path in paths if path.suffix.lower() == ".pdf"), paths[0])
        doc_type, label, concepts = classify_document(preferred)
        counters[doc_type] += 1
        formats = [path.suffix[1:].upper() for path in paths]
        note = f"现有 {' 与 '.join(formats)} 资料；{sum(path.stat().st_size for path in paths) / 1024 / 1024:.1f} MB。"
        items.append({
            "code": f"{prefixes[doc_type]}-{counters[doc_type]:02d}",
            "title": preferred.stem.replace("_", " "),
            "note": note,
            "file": preferred.name,
            "files": [path.name for path in paths],
            "type": doc_type,
            "label": label,
            "concepts": concepts,
            # 文献导读（book-guide.html）当前只有《组织》一本上线，未上线的按钮置灰防误入
            "hasGuide": normalized_stem(preferred) == "organizations march,simon",
            "guideUrl": f"/book-guide.html?file={quote(preferred.name)}" if normalized_stem(preferred) == "organizations march,simon" else None,
            # 课程讲解（跳教学平台 OpenMAIC 中已生成的项目）后续再做，UI 按钮先展示并置灰
            "hasLecture": False,
            "lectureUrl": None,
        })
    return items


# ── 课程知识库（RAG）：从课程站 html 与参考文献构建分块索引 ──────────────────
COURSE_HTML_SOURCES = ["index.html", "syllabus.html", "textbooks.html", "knowledge.html", "about.html"]
COURSE_VOCAB = set(
    "官僚制 有限理性 韦伯 西蒙 算法管理 裁量权 街头官僚 利普斯基 公共价值 摩尔 "
    "资源依赖 普费弗 加尔布雷思 爱德华兹 大内 平台政府 算法公平 正当程序 人工智能 "
    "组织理论 技术嵌入 智能行动者 公共治理 脱口秀 信息处理器 决策 权力 问责".split()
)
KB_CHUNKS = []
KB_BUILT_AT = 0


def _strip_html_to_text(text: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = _html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n", text)
    return text.strip()


def _read_plain_doc(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in (".md", ".txt"):
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""
    # PDF/DOCX 解析需要第三方库，服务器未保证安装时跳过，避免崩溃。
    return ""


def build_course_kb(force: bool = False):
    """构建课程知识块索引（带 1 小时缓存）。"""
    global KB_CHUNKS, KB_BUILT_AT
    if KB_CHUNKS and not force and time.time() - KB_BUILT_AT < 3600:
        return KB_CHUNKS
    chunks = []
    for name in COURSE_HTML_SOURCES:
        p = APP_DIR / name
        if p.is_file():
            text = _strip_html_to_text(p.read_text(encoding="utf-8", errors="ignore"))
            for blk in re.split(r"\n{2,}", text):
                blk = blk.strip()
                if len(blk) > 40:
                    chunks.append({"src": name, "text": blk[:1400]})
    if LIBRARY_DIR.is_dir():
        for path in LIBRARY_DIR.iterdir():
            if path.suffix.lower() in (".md", ".txt"):
                body = _read_plain_doc(path).strip()
                for blk in re.split(r"\n{2,}", body):
                    blk = blk.strip()
                    if len(blk) > 40:
                        chunks.append({"src": path.name, "text": blk[:1400]})
    KB_CHUNKS = chunks
    KB_BUILT_AT = time.time()
    return chunks


def retrieve_course_context(query: str, k: int = 5) -> str:
    """按课程词汇重叠 + 字符 bigram 重叠检索 top-k 知识块。"""
    chunks = build_course_kb()
    bigrams_q = set(query[i:i + 2] for i in range(len(query) - 1))
    scored = []
    for c in chunks:
        text = c["text"]
        overlap = sum(1 for w in COURSE_VOCAB if w in text and w in query)
        tb = set(text[i:i + 2] for i in range(len(text) - 1))
        bg = len(bigrams_q & tb)
        score = overlap * 6 + bg
        if score > 0:
            scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    return "\n\n".join(f"【{c['src']}】\n{c['text']}" for _, c in scored[:k])


def describe_image(b64: str, mime: str) -> str:
    """用视觉模型描述学生上传的图片，返回文本。"""
    api_key, _ = dashscope_api_key()
    if not api_key:
        return "（视觉服务未配置）"
    model = os.getenv("QWEN_VL_MODEL", "qwen-vl-max")
    request_data = json.dumps({
        "model": model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": "这是课程学生上传的一张图片。请描述其中与《人工智能与组织管理》课程相关的内容（如概念图示、作业截图、文献页面、课件），并提炼可用于回答学生问题的关键信息；若与课程无关，简要说明。"},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ],
        }],
    }).encode()
    base = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
    req = urllib.request.Request(base + "/chat/completions", data=request_data,
                                 headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.load(resp)
        return result["choices"][0]["message"]["content"]
    except Exception:
        return "（图片识别暂时不可用）"


def extract_doc_text(path: Path) -> str:
    """提取 PDF/DOCX 文本（需相应第三方库，缺失时返回空）。"""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            from pdfminer.high_level import extract_text as pdf_text
            return pdf_text(str(path))
        except Exception:
            return ""
    if suffix == ".docx":
        try:
            import docx
            return "\n".join(p.text for p in docx.Document(str(path)).paragraphs)
        except Exception:
            return ""
    return ""


def resolve_attachment_context(attachments):
    """把小程序上传的附件解析为可纳入 prompt 的上下文片段。"""
    if not attachments:
        return ""
    parts = []
    for a in attachments:
        nm = a.get("name") or ""
        url = a.get("url") or ""
        fname = None
        if "/v1/file?name=" in url:
            fname = unquote(url.split("/v1/file?name=")[1].split("&")[0])
        if not fname:
            parts.append(f"[学生上传文件：{nm or '未命名'}]")
            continue
        path = (UPLOAD_DIR / fname).resolve()
        if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
            parts.append(f"[学生上传文件（无法读取）：{nm}]")
            continue
        suffix = path.suffix.lower()
        if suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"):
            try:
                b64 = base64.b64encode(path.read_bytes()).decode()
                mime = mimetypes.guess_type(str(path))[0] or "image/png"
                parts.append(f"[图片 {nm} 的内容]\n{describe_image(b64, mime)}")
            except Exception as e:
                parts.append(f"[图片 {nm} 识别失败：{e}]")
        elif suffix in (".txt", ".md"):
            try:
                parts.append(f"[文档 {nm} 正文]\n{path.read_text(encoding='utf-8', errors='ignore')[:8000]}")
            except Exception:
                parts.append(f"[文档 {nm} 读取失败]")
        elif suffix in (".pdf", ".docx"):
            try:
                parts.append(f"[文档 {nm} 正文]\n{extract_doc_text(path)[:8000]}")
            except Exception as e:
                parts.append(f"[文档 {nm} 暂无法解析（{e}），建议上传文本版]")
        else:
            parts.append(f"[学生上传文件：{nm}]")
    return "\n\n".join(parts)


# ──────────────────────────────────────────────────────────────────────
# Plaza (知识广场) —— 项目课程平台 mock data and API
#
# 当前为本地 UI 演示数据。Stage 02 接入 FastAPI + PostgreSQL 时，只把
# PLAZA_PROJECTS / PLAZA_LIKES / PLAZA_COMMENTS 三个 dict 替换成 ORM
# 调用即可，URL/响应字段保持不变。
# ──────────────────────────────────────────────────────────────────────
def _strip_html(h: str) -> str:
    """去掉 HTML 标签并还原常见实体，得到纯文本。"""
    if not isinstance(h, str):
        return ""
    h = re.sub(r"<[^>]+>", " ", h)
    for a, b in (
        ("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"),
        ("&gt;", ">"), ("&quot;", '"'), ("&#39;", "'"),
    ):
        h = h.replace(a, b)
    return re.sub(r"\s+", " ", h).strip()


def extract_course_from_classroom(stage_id: str) -> dict | None:
    """从 OpenMAIC 真实课程文件派生广场内容。

    直接读取 apps/openmaic/data/classrooms/{stage_id}.json，取 stage.name
    作为标题、各 scene 的 canvas 文本元素作为正文。这样广场样本永远等于
    教学平台真实生成的课程，杜绝任何手写/编造内容。
    文件缺失或损坏时返回 None（绝不回退到虚构内容）。
    """
    path = OPENMAIC_CLASSROOMS_DIR / f"{stage_id}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    stage = data.get("stage", {}) or {}
    title = (stage.get("name") or "").strip()
    if not title:
        return None
    slides = []
    for s in (data.get("scenes") or []):
        if not isinstance(s, dict):
            continue
        order = int(s.get("order") or (len(slides) + 1))
        s_title = (s.get("title") or "").strip() or f"场景 {order}"
        canvas = (s.get("content") or {}).get("canvas") or {}
        texts = [
            _strip_html(e.get("content", ""))
            for e in (canvas.get("elements") or [])
            if isinstance(e, dict) and e.get("type") == "text" and e.get("content")
        ]
        body = "\n".join(t for t in texts if t)
        slides.append({"order": order, "title": s_title[:120], "content": body[:10000]})
    return {
        "title": title,
        "subtitle": f"课堂作品 · {len(slides)} 页",
        "tags": ["组织理论", "课堂作品"],
        "slides": slides,
    }


# ──────────────────────────────────────────────────────────────────────
# 封面生成（知识广场课程封面：一键生成学院风格海报）
# ──────────────────────────────────────────────────────────────────────
COVER_PALETTE = ["#0a407a", "#1f5b57", "#df7625", "#153f3c", "#5b3a8c", "#b54a32"]


def _xml_escape(text: str) -> str:
    return (str(text).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;").replace("'", "&#39;"))


def _darken(hex_color: str, factor: float = 0.5) -> str:
    m = re.match(r"^#?([0-9a-fA-F]{6})$", str(hex_color).strip())
    if not m:
        return "#08263f"
    n = int(m.group(1), 16)
    r, g, b = (n >> 16) & 255, (n >> 8) & 255, n & 255
    r, g, b = (max(0, int(c * factor)) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def _wrap_title(text: str, max_chars: int = 13, max_lines: int = 3) -> list:
    text = re.sub(r"\s+", "", str(text)).strip()
    if not text:
        return [""]
    lines = [text[i:i + max_chars] for i in range(0, len(text), max_chars)]
    lines = lines[:max_lines]
    if len(text) > max_lines * max_chars:
        lines[-1] = lines[-1][:max_chars - 1] + "…"
    return lines


def generate_cover_svg(title, subtitle, author, tags, theme_hex):
    """生成学院风格封面海报，返回 data:image/svg+xml 形式的 URI。

    标题/副标题/作者/标签均来自课程真实字段，绝不编造；仅做版式美化。
    """
    base = theme_hex if re.match(r"^#[0-9a-fA-F]{6}$", str(theme_hex)) else "#0a407a"
    dark = _darken(base, 0.5)
    accent = "#df7625" if base.lower() != "#df7625" else "#ffd9a8"
    w, h = 800, 450
    title_lines = _wrap_title(title, 13, 3)
    ty = 255 - (len(title_lines) - 1) * 27
    title_svg = ""
    for line in title_lines:
        title_svg += (f'<text x="56" y="{ty}" font-family="PingFang SC, Microsoft YaHei, sans-serif" '
                      f'font-size="42" font-weight="700" fill="#ffffff">{_xml_escape(line)}</text>\n')
        ty += 52
    subtitle_text = _xml_escape((subtitle or "")[:42])
    author_text = _xml_escape(f"@{(author or '学习者')[:14]}")
    tags_svg = ""
    tx = 56
    for tag in (tags or [])[:4]:
        t = _xml_escape(str(tag)[:10])
        tw = len(t) * 14 + 30
        tags_svg += (f'<rect x="{tx}" y="372" width="{tw}" height="30" rx="15" fill="#ffffff" fill-opacity="0.18"/>'
                     f'<text x="{tx + 15}" y="392" font-family="PingFang SC, sans-serif" font-size="15" fill="#ffffff">{t}</text>\n')
        tx += tw + 10
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{base}"/><stop offset="1" stop-color="{dark}"/></linearGradient></defs>'
        f'<rect width="{w}" height="{h}" fill="url(#g)"/>'
        f'<circle cx="705" cy="55" r="150" fill="{accent}" fill-opacity="0.12"/>'
        f'<circle cx="770" cy="400" r="95" fill="#ffffff" fill-opacity="0.08"/>'
        f'<rect x="56" y="58" width="46" height="6" rx="3" fill="{accent}"/>'
        f'<text x="56" y="92" font-family="PingFang SC, sans-serif" font-size="16" font-weight="700" letter-spacing="3" fill="{accent}">AI &amp; ORGANIZATION</text>'
        f'{title_svg}'
        f'<text x="56" y="322" font-family="PingFang SC, sans-serif" font-size="18" fill="#ffffff" fill-opacity="0.88">{subtitle_text}</text>'
        f'{tags_svg}'
        f'<text x="56" y="424" font-family="PingFang SC, sans-serif" font-size="16" fill="#ffffff" fill-opacity="0.92">{author_text}</text>'
        f'</svg>'
    )
    return "data:image/svg+xml," + quote(svg, safe="")


# 公开样本：从本地 OpenMAIC 真实课程「有限理性：组织理论视角」派生，
# 不手写任何标题/正文。其他用户发布的项目经 /api/plaza/import 写入 data/plaza.json。
REAL_SAMPLE_STAGE = "zbmZvlh65w"
_real = extract_course_from_classroom(REAL_SAMPLE_STAGE)
PLAZA_PROJECTS: dict = {}
if _real:
    PLAZA_PROJECTS["p-2026-real-kr"] = {
        "id": "p-2026-real-kr",
        "sourceStageId": REAL_SAMPLE_STAGE,
        "title": _real["title"],
        "subtitle": _real["subtitle"],
        "owner": {"name": "徐亦恒", "avatar": "徐", "role": "项目主理人"},
        "cover": generate_cover_svg(_real["title"], _real["subtitle"], "徐亦恒", _real["tags"], "#0a407a"),
        "tags": _real["tags"],
        "views": 29,
        "likes": 0,
        "liked": False,
        "comments": [],
        "createdAt": "2026-08-15",
        "isPublic": True,
        "ownerUserId": None,  # 公开样本，不属于具体注册用户
        "slides": _real["slides"],
    }


def plaza_projects_payload():
    """Return projects with derived comment counts; drop email-like fields."""
    items = []
    for project in PLAZA_PROJECTS.values():
        item = dict(project)
        item["commentCount"] = len(project.get("comments", []))
        items.append(item)
    # newest first
    items.sort(key=lambda p: p["createdAt"], reverse=True)
    return items


def plaza_projects_for_user(user: dict | None) -> list:
    """根据当前用户过滤可见项目。

    - 未登录：仅看未归属具体用户的公开样本（ownerUserId is None 且 isPublic）
    - 已登录：所有公开项目（含其他同学发布的）+ 自己私有的项目
    满足"不同同学登录后都能看到彼此在知识广场发布的课程"。
    """
    items = plaza_projects_payload()
    if not user:
        return [p for p in items if p.get("isPublic") and not p.get("ownerUserId")]
    user_id = user.get("id")
    return [p for p in items if p.get("isPublic") or p.get("ownerUserId") == user_id]


def safe_library_path(raw_name: str) -> Path:
    name = Path(unquote(raw_name)).name
    path = (LIBRARY_DIR / name).resolve()
    if path.parent != LIBRARY_DIR.resolve() or not path.is_file():
        raise FileNotFoundError(name)
    return path


# ════════════════════════════════════════════════════════════════════
# 数据持久化（plaza + users + sessions 都落到 JSON 文件，不丢失）
# ════════════════════════════════════════════════════════════════════
import hashlib
import hmac
import secrets
import re

PBKDF2_ITER = 120_000
PBKDF2_SALT_BYTES = 16
SESSION_TOKEN_BYTES = 32
SESSION_TTL_SECONDS = 30 * 24 * 3600  # 30 天


def _atomic_write_json(path: Path, payload):
    """写 JSON 时先写临时文件再 rename，避免写一半中断损坏数据。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def hash_password(password: str, salt: bytes = None) -> str:
    salt = salt or secrets.token_bytes(PBKDF2_SALT_BYTES)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITER)
    return f"pbkdf2_sha256${PBKDF2_ITER}${salt.hex()}${dk.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    try:
        algo, iters, salt_hex, dk_hex = hashed.split("$")
        if algo != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
        candidate = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(iters)
        )
        return hmac.compare_digest(candidate, expected)
    except (ValueError, TypeError):
        return False


def load_users() -> dict:
    return _read_json(USERS_FILE, {})


def save_users(users: dict):
    _atomic_write_json(USERS_FILE, users)


def load_sessions() -> dict:
    return _read_json(SESSIONS_FILE, {})


def save_sessions(sessions: dict):
    _atomic_write_json(SESSIONS_FILE, sessions)


def prune_sessions(sessions: dict) -> dict:
    """清理过期 session，返回保留的 dict。"""
    now = int(time.time())
    return {token: data for token, data in sessions.items()
            if data.get("expiresAt", 0) > now}


# ───────────────── 会话历史（小程序 /v1/conversations，按 userId 隔离） ─────────────────
CONVERSATION_TITLE_FALLBACK = "新对话"


def _conversation_visible_to(c, user):
    """判断会话是否对当前登录用户可见。openedId 也允许微信登录用户匹配。"""
    if not c or not user:
        return False
    owner = c.get("userId")
    if owner == user.get("id"):
        return True
    owner_openid = c.get("userOpenid")
    user_openid = user.get("openid")
    return bool(owner_openid and user_openid and owner_openid == user_openid)


def _conversation_summary(c):
    """轻量摘要：用于列表展示，不暴露完整消息。"""
    messages = c.get("messages") or []
    preview = ""
    last_role = ""
    for m in reversed(messages):
        text = (m.get("content") or "").strip()
        if text:
            preview = text[:60]
            last_role = m.get("role", "")
            break
    return {
        "id": c.get("id"),
        "title": c.get("title") or CONVERSATION_TITLE_FALLBACK,
        "messageCount": len(messages),
        "preview": preview,
        "lastRole": last_role,
        "createdAt": c.get("createdAt", 0),
        "updatedAt": c.get("updatedAt", 0),
        "archived": bool(c.get("archived")),
    }


def load_conversations() -> dict:
    return _read_json(CONVERSATIONS_FILE, {})


def save_conversations(conversations: dict):
    _atomic_write_json(CONVERSATIONS_FILE, conversations)


def list_user_conversations(user):
    convs = load_conversations()
    items = [_conversation_summary(c) for c in convs.values() if _conversation_visible_to(c, user) and not c.get("archived")]
    items.sort(key=lambda x: x.get("updatedAt", 0), reverse=True)
    return items


def handle_v1_conversations(self, payload):
    """GET 列表 / POST 新建（已鉴权）。"""
    user = current_user_from_request(self)
    if not user:
        return self.send_json({"error": "请先登录微信账号再查看历史会话。"}, 401)
    parsed = urlparse(self.path)
    if self.command == "GET":
        return self.send_json({"items": list_user_conversations(user)})
    # POST 新建
    title = str((payload or {}).get("title") or "").strip()[:80] or CONVERSATION_TITLE_FALLBACK
    conv_id = f"c-{int(time.time() * 1000)}-{secrets.token_hex(3)}"
    convs = load_conversations()
    now = int(time.time() * 1000)
    convs[conv_id] = {
        "id": conv_id,
        "userId": user.get("id"),
        "userOpenid": user.get("openid"),
        "title": title,
        "messages": [],
        "createdAt": now,
        "updatedAt": now,
        "archived": False,
    }
    save_conversations(convs)
    return self.send_json({"conversation": _conversation_summary(convs[conv_id])})


def handle_v1_conversation_item(self, payload, conv_id):
    """单条会话：GET 详情 / PUT 追加 / DELETE 软删。"""
    user = current_user_from_request(self)
    if not user:
        return self.send_json({"error": "请先登录微信账号再操作历史会话。"}, 401)
    if not conv_id or not re.fullmatch(r"[A-Za-z0-9_\-]{4,64}", conv_id):
        return self.send_json({"error": "会话标识无效。"}, 400)
    convs = load_conversations()
    conv = convs.get(conv_id)
    if not conv or not _conversation_visible_to(conv, user):
        return self.send_json({"error": "会话不存在或已过期。"}, 404)

    if self.command == "GET":
        return self.send_json({"conversation": conv})

    if self.command == "PUT":
        new_message = (payload or {}).get("appendMessage") or {}
        role = str(new_message.get("role", "")).strip()
        if role not in ("user", "assistant"):
            return self.send_json({"error": "消息角色必须是 user 或 assistant。"}, 400)
        content = str(new_message.get("content", "")).strip()[:8000]
        if not content:
            return self.send_json({"error": "消息内容不能为空。"}, 400)
        atts = new_message.get("attachments") or []
        if not isinstance(atts, list):
            return self.send_json({"error": "附件格式不正确。"}, 400)
        clean_atts = []
        for a in atts[:6]:
            if isinstance(a, dict):
                clean_atts.append({
                    "type": str(a.get("type", "file")),
                    "name": str(a.get("name", ""))[:120],
                })
        conv["messages"].append({
            "role": role,
            "content": content,
            "attachments": clean_atts,
            "createdAt": int(time.time() * 1000),
        })
        # 限制条数防膨胀：仅保留最后 200 条
        if len(conv["messages"]) > 200:
            conv["messages"] = conv["messages"][-200:]
        # 标题优先取自首次用户提问（自动摘要）
        if (not conv.get("title") or conv.get("title") == CONVERSATION_TITLE_FALLBACK) and role == "user":
            auto = content.replace("\n", " ").strip()
            conv["title"] = (auto[:24] + ("…" if len(auto) > 24 else "")) or CONVERSATION_TITLE_FALLBACK
        custom_title = str((payload or {}).get("title") or "").strip()[:80]
        if custom_title:
            conv["title"] = custom_title
        conv["updatedAt"] = int(time.time() * 1000)
        convs[conv_id] = conv
        save_conversations(convs)
        return self.send_json({"conversation": _conversation_summary(conv), "messageCount": len(conv["messages"])})

    if self.command == "DELETE":
        conv["archived"] = True
        conv["updatedAt"] = int(time.time() * 1000)
        convs[conv_id] = conv
        save_conversations(convs)
        return self.send_json({"ok": True, "id": conv_id})

    return self.send_error(405)


PLAZA_FILE = DATA_DIR / "plaza.json"


def load_plaza_projects() -> dict:
    return _read_json(PLAZA_FILE, {})


def save_plaza_projects():
    _atomic_write_json(PLAZA_FILE, PLAZA_PROJECTS)


# 启动时把磁盘上的项目合并进内存（保留 mock + 用户发布的）
_disk_plaza = load_plaza_projects()
for _pid, _p in _disk_plaza.items():
    if _pid in PLAZA_PROJECTS:
        # 派生样本：文本内容始终来自真实课程（杜绝编造）；
        # 仅在磁盘封面是"发布者生成的图片"（data: URI）时才恢复，
        # 旧版默认纯色则由真实课程重新生成学院海报，保证默认封面始终美观；
        # 同时恢复认领后的 ownerUserId，使发布者的修改持久化。
        if isinstance(_p.get("cover"), str) and _p["cover"].startswith("data:image"):
            PLAZA_PROJECTS[_pid]["cover"] = _p["cover"]
        if _p.get("ownerUserId"):
            PLAZA_PROJECTS[_pid]["ownerUserId"] = _p["ownerUserId"]
    else:
        PLAZA_PROJECTS[_pid] = _p
del _disk_plaza


def current_user_from_request(handler):
    """从 Cookie 读 session token，返回用户对象或 None。"""
    cookie_header = handler.headers.get("Cookie", "")
    token = None
    for part in cookie_header.split(";"):
        part = part.strip()
        if part.startswith("aio_session="):
            token = part[len("aio_session="):]
            break
    if not token:
        return None
    sessions = prune_sessions(load_sessions())
    data = sessions.get(token)
    if not data:
        return None
    users = load_users()
    user = users.get(data.get("userId"))
    if not user:
        return None
    return {
        "id": user["id"], "name": user["name"],
        "email": user.get("email"), "phone": user.get("phone"),
        "role": user.get("role"),
        "accountType": user.get("accountType"),
        "studentId": user.get("studentId"),
        # account = loginKey 去掉 "email:" / "phone:" 前缀；前端展示用脱敏
        "account": (user.get("loginKey") or "").split(":", 1)[-1] if user.get("loginKey") else None,
        "avatar": user.get("name", "用")[:1],
        "createdAt": user.get("createdAt"),
    }


def session_cookie_header(token: str, expires_at: int) -> tuple:
    """返回 Set-Cookie 头 (name, value)，供 send_json extra_headers 使用。"""
    value = (
        f"aio_session={token}; Path=/; HttpOnly; SameSite=Lax; "
        f"Expires={time.strftime('%a, %d %b %Y %H:%M:%S GMT', time.gmtime(expires_at))}"
    )
    return ("Set-Cookie", value)


def _read_plaza_payload(self):
    """Read JSON body for /api/plaza/* endpoints, capped by MAX_BODY."""
    try:
        length = int(self.headers.get("Content-Length", "0"))
    except ValueError:
        return None, self.send_json({"error": "请求长度无效。"}, 400)
    if length <= 0 or length > MAX_BODY:
        return None, self.send_json({"error": "请求内容过大或为空。"}, 400)
    try:
        payload = json.loads(self.rfile.read(length))
    except (ValueError, json.JSONDecodeError):
        return None, self.send_json({"error": "请求格式不正确。"}, 400)
    return payload, None


def handle_plaza_like(self, payload, project_id):
    project = PLAZA_PROJECTS.get(project_id)
    if not project:
        return self.send_json({"error": "项目不存在。"}, 404)
    action = str(payload.get("action", "toggle")).strip()
    if action == "on":
        if not project["liked"]:
            project["likes"] += 1
            project["liked"] = True
    elif action == "off":
        if project["liked"]:
            project["likes"] = max(0, project["likes"] - 1)
            project["liked"] = False
    else:  # toggle
        if project["liked"]:
            project["likes"] = max(0, project["likes"] - 1)
            project["liked"] = False
        else:
            project["likes"] += 1
            project["liked"] = True
    save_plaza_projects()
    return self.send_json({
        "liked": project["liked"],
        "likes": project["likes"],
    })


def handle_plaza_comment(self, payload, project_id):
    project = PLAZA_PROJECTS.get(project_id)
    if not project:
        return self.send_json({"error": "项目不存在。"}, 404)
    text = str(payload.get("text", "")).strip()
    author = str(payload.get("author", "")).strip() or "学习者"
    if not text:
        return self.send_json({"error": "评论内容不能为空。"}, 400)
    if len(text) > 600:
        return self.send_json({"error": "评论请控制在 600 字内。"}, 400)
    import time
    comment = {
        "id": f"c-{int(time.time() * 1000)}",
        "author": author,
        "avatar": author[:1],
        "time": "刚刚",
        "text": text,
    }
    project.setdefault("comments", []).append(comment)
    save_plaza_projects()
    return self.send_json({"comment": comment, "commentCount": len(project["comments"])})


def handle_plaza_import(self, payload):
    """接收 OpenMAIC 发布的真实课程，写入 PLAZA_PROJECTS。

    Payload 约定（OpenMAIC 端发送）：
      - stageId:      OpenMAIC 的 stage id
      - title:        课程名（classroom.name）
      - description:  课程描述（classroom.description）
      - sceneCount:   场景数（classroom.sceneCount）
      - createdAt:    OpenMAIC 创建时间戳（毫秒）
      - ownerName:    发布者名字（OpenMAIC 的 nickname）
      - ownerAvatar:  发布者头像首字
    返回新创建的 project id；重复发布返回已存在的 project id。
    """
    user = current_user_from_request(self)
    stage_id = str(payload.get("stageId", "")).strip()
    title = str(payload.get("title", "")).strip() or "未命名课程"
    if not stage_id:
        return self.send_json({"error": "缺少 stageId。"}, 400)

    # 幂等：同一 stageId 已发布过，更新内容但保留统计数据（views/likes/comments/cover）
    existing = next(
        (p for p in PLAZA_PROJECTS.values() if p.get("sourceStageId") == stage_id),
        None,
    )
    if existing:
        # 仅更新可变内容字段；不覆盖用户手动改过的封面和互动数据
        existing["title"] = title
        existing["subtitle"] = subtitle
        existing["tags"] = ["OpenMAIC", "课堂作品"]
        existing["slides"] = slides
        existing["updatedAt"] = _time.strftime("%Y-%m-%d %H:%M")
        # 同步更新演示样本（若 sourceStageId 匹配），确保广场入口始终是最新内容
        _demo = PLAZA_PROJECTS.get("p-2026-real-kr")
        if _demo and _demo.get("sourceStageId") == stage_id:
            _demo["title"] = title
            _demo["subtitle"] = subtitle
            _demo["slides"] = slides
            # 重新生成默认封面（若封面仍是自动生成的 SVG）；用户手动上传/选择的不覆盖
            if not (_demo.get("cover") or "").startswith("data:image/jpeg"):
                _theme = COVER_PALETTE[sum(ord(c) for c in stage_id) % len(COVER_PALETTE)]
                _demo["cover"] = generate_cover_svg(title, subtitle, _demo.get("owner", {}).get("name", "学习者"), ["组织理论", "课堂作品"], _theme)
        save_plaza_projects()
        return self.send_json({
            "ok": True,
            "projectId": existing["id"],
            "duplicate": True,
            "updated": True,
            "openUrl": f"/projects.html",
        })

    import time as _time
    project_id = f"p-imported-{int(_time.time())}"
    owner_name = str(payload.get("ownerName", "")).strip() or "学习者"
    owner_avatar = str(payload.get("ownerAvatar", "")).strip() or owner_name[:1] or "学"
    scene_count = int(payload.get("sceneCount", 0) or 0)
    description = str(payload.get("description", "")).strip()
    subtitle_bits = [f"{scene_count} 页" if scene_count else "新发布"]
    if description:
        subtitle_bits.append(description[:60])
    subtitle = " · ".join(subtitle_bits)
    created_at_ms = int(payload.get("createdAt", 0) or 0)
    if created_at_ms > 0:
        created_at_str = _time.strftime("%Y-%m-%d", _time.localtime(created_at_ms / 1000))
    else:
        created_at_str = _time.strftime("%Y-%m-%d")

    # 封面：默认生成一张学院风格海报（发布者可在知识广场一键替换/上传）
    theme_hex = COVER_PALETTE[sum(ord(c) for c in stage_id) % len(COVER_PALETTE)]
    cover = generate_cover_svg(title, subtitle, owner_name, ["OpenMAIC", "课堂作品"], theme_hex)

    # Slides 快照：来自 OpenMAIC loadStageData 简化后的 [{order,title,content}]
    raw_slides = payload.get("slides") or []
    slides = []
    if isinstance(raw_slides, list):
        for s in raw_slides[:30]:  # 最多 30 张
            if not isinstance(s, dict):
                continue
            order = int(s.get("order", len(slides)) or 0)
            slide_title = str(s.get("title", "")).strip()[:120] or f"场景 {order + 1}"
            content = str(s.get("content", "")).strip()[:10000]  # 单 slide 限 10KB
            slides.append({"order": order, "title": slide_title, "content": content})

    new_project = {
        "id": project_id,
        "sourceStageId": stage_id,
        "title": title,
        "subtitle": subtitle,
        "owner": {"name": owner_name, "avatar": owner_avatar, "role": "学习者"},
        "ownerUserId": user["id"] if user else None,  # 关联登录账户
        "cover": cover,
        "tags": ["OpenMAIC", "课堂作品"],
        "views": 0,
        "likes": 0,
        "liked": False,
        "comments": [],
        "createdAt": created_at_str,
        "isPublic": True,  # 默认公开，登录后可在广场看到
        "slides": slides,
    }
    PLAZA_PROJECTS[project_id] = new_project
    save_plaza_projects()
    return self.send_json({
        "ok": True,
        "projectId": project_id,
        "duplicate": False,
        "openUrl": f"/projects.html",
        "project": new_project,
    })


def handle_plaza_cover(self, payload, project_id):
    """发布者修改课程封面。

    权限：必须已登录，且为项目发布者本人——
      - ownerUserId 与登录用户 id 一致；或
      - ownerUserId 为 None（演示样本 / 跨平台未带凭证发布）且 owner.name 与登录名一致。
    演示样本首次被发布者编辑时会"认领"：写入 ownerUserId，便于后续校验。

    Body 二选一：
      - {action: "generate", theme?: int}  → 服务端按主题色生成学院海报
      - {cover: "<#hex 或 data:image/...>"} → 直接设定（颜色或上传图片）
    """
    user = current_user_from_request(self)
    if not user:
        return self.send_json({"error": "请先登录课程平台后再修改封面。"}, 401)
    project = PLAZA_PROJECTS.get(project_id)
    if not project:
        return self.send_json({"error": "项目不存在。"}, 404)
    owner = project.get("owner") or {}
    is_owner = (
        project.get("ownerUserId") == user["id"]
        or (not project.get("ownerUserId") and owner.get("name") == user.get("name"))
    )
    if not is_owner:
        return self.send_json({"error": "只有发布者本人可以修改封面。"}, 403)

    # 首次以登录身份认领（演示样本 ownerUserId 为 None 时）
    if not project.get("ownerUserId"):
        project["ownerUserId"] = user["id"]

    action = str(payload.get("action", "")).strip()
    if action == "generate":
        theme = payload.get("theme")
        if isinstance(theme, int) and 0 <= theme < len(COVER_PALETTE):
            theme_hex = COVER_PALETTE[theme]
        else:
            theme_hex = COVER_PALETTE[sum(ord(c) for c in project_id) % len(COVER_PALETTE)]
        cover = generate_cover_svg(
            project.get("title", ""),
            project.get("subtitle", ""),
            (project.get("owner") or {}).get("name", ""),
            project.get("tags", []),
            theme_hex,
        )
        project["cover"] = cover
    else:
        cover_value = str(payload.get("cover", "")).strip()
        if not cover_value:
            return self.send_json({"error": "缺少封面内容。"}, 400)
        if cover_value.startswith("data:image/"):
            if len(cover_value) > 3_000_000:
                return self.send_json({"error": "封面图片过大（上限约 3 MB）。"}, 413)
        elif re.match(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", cover_value):
            pass
        else:
            return self.send_json({"error": "封面格式不支持，请使用颜色或图片。"}, 400)
        project["cover"] = cover_value

    save_plaza_projects()
    return self.send_json({"ok": True, "cover": project["cover"]})


def pdf_to_text(path: Path) -> str:
    configured = os.getenv("PDFTOTEXT_BIN", "").strip()
    candidates = [configured, shutil.which("pdftotext"), "/opt/homebrew/bin/pdftotext", "/usr/local/bin/pdftotext"]
    executable = next((candidate for candidate in candidates if candidate and Path(candidate).is_file()), "")
    if executable:
        completed = subprocess.run(
            [executable, "-f", "1", "-l", "12", str(path), "-"],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
        if completed.returncode == 0 and completed.stdout.strip():
            return completed.stdout
    try:
        import fitz

        with fitz.open(path) as document:
            return "\n\n".join(page.get_text() for page in list(document)[:12])
    except (ImportError, OSError, RuntimeError) as exc:
        raise RuntimeError("PDF text extraction unavailable") from exc


# 课程展示内容默认结构：首次运行若无 course-content.json 则落地此默认，便于后续编辑。
DEFAULT_COURSE_CONTENT = {
    "version": 1,
    "updatedAt": "2026-08-18",
    "hero": {
        "eyebrow": "16 周主题内容 · 组织理论 × 人工智能",
        "titleLead": "人工智能与",
        "titleAccent": "组织管理",
        "lead": "从经典组织理论出发，理解算法管理、大语言模型和智能体如何进入组织的分工、决策、权力与责任，并把这些变化放回公共管理的现实情境中讨论。",
        "team": [
            {"label": "内容作者：", "name": "于君博"},
            {"label": "内容协作：", "name": "徐亦恒"},
        ],
    },
    "filmChapters": [
        {"no": "01", "label": "内容命题", "desc": "组织理论 × 人工智能为何相遇"},
        {"no": "02", "label": "16 周路径", "desc": "四个阶段，从解释组织到约束算法"},
        {"no": "03", "label": "每周 90 分钟", "desc": "30 分钟讲授 + 60 分钟学术讨论"},
        {"no": "04", "label": "真实平台", "desc": "在教学平台上动手做，做完可发布"},
    ],
    "phases": [
        {"no": "01", "weeks": "WEEK 01—04", "stage": 1, "title": "组织理论：解释组织", "desc": "用官僚制、有限理性、信息处理与资源依赖回答“组织为何如此运作”。"},
        {"no": "02", "weeks": "WEEK 05—08", "stage": 2, "title": "技术嵌入：重塑结构与协作", "desc": "考察算法管理和人机协作如何改变控制、团队、领导与变革。"},
        {"no": "03", "weeks": "WEEK 09—12", "stage": 3, "title": "智能行动者：重构决策与权力", "desc": "讨论 AI 进入判断和行动之后，裁量、价值与制度关系怎样变化。"},
        {"no": "04", "weeks": "WEEK 13—16", "stage": 4, "title": "公共治理：约束算法与责任", "desc": "把公平、程序、司法审查与监管转化为可执行的公共责任框架。"},
    ],
    "entries": [
        {"no": "01 / SYLLABUS", "title": "内容大纲", "desc": "四个阶段、16 周主题、内容安排与学习反馈方式。"},
        {"no": "02 / MATERIALS", "title": "学习资料", "desc": "主资料、人工智能基础素养与 AI 实操指南。"},
    ],
}


def load_course_content():
    """读取课程展示内容（单一数据源）。

    返回结构见 DEFAULT_COURSE_CONTENT。每次请求实时读盘，
    因此编辑 course-content.json 后无需重启服务即可生效。
    文件缺失或损坏时回退默认并落地默认文件，便于首次部署引导。
    """
    try:
        if COURSE_CONTENT_FILE.exists():
            return json.loads(COURSE_CONTENT_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        pass
    # 首次运行或文件损坏：落地默认文件并回退
    try:
        COURSE_CONTENT_FILE.write_text(
            json.dumps(DEFAULT_COURSE_CONTENT, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        pass
    return DEFAULT_COURSE_CONTENT


class CourseHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Cache-Control", "no-store, must-revalidate")
        # 跨域：OpenMAIC(3100) 带凭证发布课程到知识广场(8765) 时，
        # 浏览器要求精确 Origin + Allow-Credentials（不能用 *）。
        # 同源或本地无 Origin 时回退 *，保持向后兼容。
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Credentials", "true")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename, Authorization")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, payload, status=200, extra_headers=None):
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        for name, value in (extra_headers or []):
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/document":
            return self.serve_document(parse_qs(parsed.query).get("file", [""])[0], inline=True)
        if parsed.path == "/api/download":
            return self.serve_document(parse_qs(parsed.query).get("file", [""])[0], inline=False)
        if parsed.path == "/api/text":
            return self.serve_text(parse_qs(parsed.query).get("file", [""])[0])
        if parsed.path == "/api/download-all":
            return self.serve_archive()
        if parsed.path == "/api/library":
            items = library_items()
            return self.send_json({"items": items, "files": sum(len(item["files"]) for item in items)})
        if parsed.path == "/api/plaza/projects":
            user = current_user_from_request(self)
            return self.send_json({"items": plaza_projects_for_user(user)})
        if parsed.path.startswith("/api/plaza/project/"):
            project_id = unquote(parsed.path[len("/api/plaza/project/"):])
            project = PLAZA_PROJECTS.get(project_id)
            if not project:
                return self.send_json({"error": "项目不存在。"}, 404)
            # 真实浏览量：按 cookie 去重（每个 session 30 分钟只算一次）
            view_cookie = f"aio_viewed_{project_id}"
            already_viewed = any(
                part.strip().startswith(view_cookie + "=")
                for part in self.headers.get("Cookie", "").split(";")
            )
            extra = None
            if not already_viewed:
                project["views"] = project.get("views", 0) + 1
                extra = [("Set-Cookie",
                          f"{view_cookie}=1; Path=/; Max-Age=1800; SameSite=Lax")]
                save_plaza_projects()
            item = dict(project)
            item["commentCount"] = len(project.get("comments", []))
            return self.send_json({"project": item}, extra_headers=extra)
        if parsed.path == "/api/plaza/import":
            # GET 仍保留为引导（向后兼容 projects.html 旧按钮），
            # POST 才是真实入库路径，由 OpenMAIC 的"发布到知识广场"按钮调用。
            return self.send_json({
                "ok": True,
                "openUrl": "/teaching.html",
                "message": "请在教学平台生成课程后，点击课程卡片右上角的发布按钮。",
            })
        if parsed.path == "/api/ai-status":
            api_key, source = dashscope_api_key()
            return self.send_json({
                "configured": bool(api_key),
                "model": os.getenv("QWEN_MODEL", "qwen-plus"),
                "credentialSource": source or None,
                "rateLimit": {"requests": AI_RATE_LIMIT, "seconds": AI_RATE_WINDOW_SECONDS},
            })
        if parsed.path == "/api/auth/me":
            user = current_user_from_request(self)
            return self.send_json({"user": user})
        if parsed.path in ("/api/course/overview", "/v1/course/overview"):
            # 课程展示内容（大纲 / FILM 章节 / 课程介绍 / 入口文案）。
            # 公开只读，无需登录；小程序与网站共用，编辑 JSON 即两端同步。
            return self.send_json(load_course_content())
        if parsed.path == "/v1/file":
            return self.serve_uploaded_file(parse_qs(parsed.query).get("name", [""])[0])
        if parsed.path == "/v1/conversations":
            return handle_v1_conversations(self, payload=None)
        if parsed.path.startswith("/v1/conversations/"):
            conv_id = unquote(parsed.path[len("/v1/conversations/"):])
            return handle_v1_conversation_item(self, payload=None, conv_id=conv_id)
        if parsed.path == "/":
            self.path = "/index.html"
        elif parsed.path not in PUBLIC_FILES:
            return self.send_error(404, "Not found")
        return super().do_GET()

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.path = "/index.html"
        elif parsed.path not in PUBLIC_FILES:
            return self.send_error(404, "Not found")
        return super().do_HEAD()

    def do_PUT(self):
        """仅支持 /v1/conversations/<id>（追加消息）。"""
        if not self.path.startswith("/v1/conversations/"):
            return self.send_error(501, "Method not supported")
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_BODY:
                return self.send_json({"error": "请求内容过大或为空。"}, 400)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (ValueError, json.JSONDecodeError):
            return self.send_json({"error": "请求格式不正确。"}, 400)
        conv_id = unquote(self.path[len("/v1/conversations/"):])
        return handle_v1_conversation_item(self, payload, conv_id)

    def do_DELETE(self):
        """仅支持 /v1/conversations/<id>（软删）。"""
        if not self.path.startswith("/v1/conversations/"):
            return self.send_error(501, "Method not supported")
        conv_id = unquote(self.path[len("/v1/conversations/"):])
        return handle_v1_conversation_item(self, payload=None, conv_id=conv_id)

    def do_POST(self):
        if self.path == "/api/upload":
            return self.receive_upload()
        # Auth 端点（无 body 或独立处理）
        if self.path == "/api/auth/logout":
            return self.handle_auth_logout()
        # 多部件上传（来自 wx.uploadFile）：必须在 JSON body 读取之前处理
        if self.path == "/v1/upload":
            return self.receive_v1_upload()
        if self.path == "/v1/asr":
            return self.receive_v1_asr()
        # 白名单：/v1/* 与已知 /api/* 放行，其余 404
        if not self.path.startswith(("/api/plaza/", "/api/auth/", "/v1/")):
            if self.path not in ("/api/ask", "/api/translate"):
                return self.send_error(404)
        # JSON body 读取（部分端点需要）
        if self.path in ("/api/ask", "/api/translate", "/v1/ask", "/v1/auth/wechat/login"):
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_BODY:
                    return self.send_json({"error": "请求内容过大或为空。"}, 400)
                payload = json.loads(self.rfile.read(length))
            except (ValueError, json.JSONDecodeError):
                return self.send_json({"error": "请求格式不正确。"}, 400)
        else:
            payload, error_response = _read_plaza_payload(self)
            if error_response:
                return error_response
        if self.path in ("/api/ask", "/api/translate"):
            return self.call_qwen(payload, translate=self.path.endswith("translate"))
        if self.path == "/v1/ask":
            return self.handle_v1_ask(payload)
        if self.path == "/v1/auth/wechat/login":
            return self.handle_v1_wechat_login(payload)
        if self.path == "/v1/conversations":
            return handle_v1_conversations(self, payload)
        if self.path.startswith("/v1/conversations/"):
            conv_id = unquote(self.path[len("/v1/conversations/"):])
            return handle_v1_conversation_item(self, payload, conv_id)
        if self.path == "/api/plaza/like":
            project_id = str(payload.get("projectId", "")).strip()
            return handle_plaza_like(self, payload, project_id)
        if self.path == "/api/plaza/comment":
            project_id = str(payload.get("projectId", "")).strip()
            return handle_plaza_comment(self, payload, project_id)
        if self.path == "/api/plaza/import":
            return handle_plaza_import(self, payload)
        if self.path.startswith("/api/plaza/cover/"):
            project_id = unquote(self.path[len("/api/plaza/cover/"):])
            return handle_plaza_cover(self, payload, project_id)
        if self.path == "/api/auth/register":
            return self.handle_auth_register(payload)
        if self.path == "/api/auth/login":
            return self.handle_auth_login(payload)
        if self.path == "/api/auth/reset-password":
            return self.handle_auth_reset_password(payload)
        return self.send_error(404)

    # ───────────────── Auth handlers ─────────────────
    def handle_auth_register(self, payload):
        """注册新用户。

        Payload 字段：
          - accountType: 'student' | 'guest'  (required)
          - account:     邮箱或手机号 (required, 用于登录)
          - password:    至少 8 位 (required)
          - name:        显示名 (required)
          - studentId:   课程学生必须提供学号
        """
        account_type = str(payload.get("accountType", "")).strip()
        account = str(payload.get("account", "")).strip()
        password = str(payload.get("password", ""))
        name = str(payload.get("name", "")).strip()
        student_id = str(payload.get("studentId", "")).strip()

        if account_type not in ("student", "guest"):
            return self.send_json({"error": "请选择身份：课程学生或游客。"}, 400)
        if account_type == "student" and not student_id:
            return self.send_json({"error": "课程学生必须填写学号。"}, 400)
        if not account:
            return self.send_json({"error": "请填写邮箱或手机号。"}, 400)
        if "@" in account:
            if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", account):
                return self.send_json({"error": "邮箱格式不正确。"}, 400)
            login_key = f"email:{account.lower()}"
        elif re.match(r"^\+?\d{8,15}$", account.replace(" ", "").replace("-", "")):
            login_key = f"phone:{account.replace(' ', '').replace('-', '')}"
        else:
            return self.send_json({"error": "请填写有效邮箱或手机号。"}, 400)
        if len(password) < 8:
            return self.send_json({"error": "密码至少 8 位。"}, 400)
        if not name:
            return self.send_json({"error": "请填写姓名或昵称。"}, 400)

        users = load_users()
        if any(u.get("loginKey") == login_key for u in users.values()):
            return self.send_json({"error": "该邮箱或手机号已注册，请直接登录。"}, 409)

        user_id = f"u-{int(time.time() * 1000)}"
        user = {
            "id": user_id,
            "name": name,
            "accountType": account_type,
            "loginKey": login_key,
            "passwordHash": hash_password(password),
            "role": "课程学生" if account_type == "student" else "游客",
            "createdAt": int(time.time() * 1000),
        }
        if "@" in account:
            user["email"] = account.lower()
        else:
            user["phone"] = account.replace(" ", "").replace("-", "")
        if account_type == "student":
            user["studentId"] = student_id

        users[user_id] = user
        save_users(users)

        # 自动登录：颁发 session
        return self._issue_session(user, registered=True)

    def handle_auth_login(self, payload):
        account = str(payload.get("account", "")).strip()
        password = str(payload.get("password", ""))
        if not account or not password:
            return self.send_json({"error": "请填写邮箱/手机号和密码。"}, 400)

        if "@" in account:
            login_key = f"email:{account.lower()}"
        else:
            login_key = f"phone:{account.replace(' ', '').replace('-', '')}"
        users = load_users()
        user = next((u for u in users.values() if u.get("loginKey") == login_key), None)
        if not user or not verify_password(password, user.get("passwordHash", "")):
            return self.send_json({"error": "邮箱/手机号或密码错误。"}, 401)
        return self._issue_session(user, registered=False)

    def handle_auth_logout(self):
        cookie_header = self.headers.get("Cookie", "")
        for part in cookie_header.split(";"):
            part = part.strip()
            if part.startswith("aio_session="):
                token = part[len("aio_session="):]
                sessions = load_sessions()
                sessions.pop(token, None)
                save_sessions(sessions)
                break
        # 清 cookie
        return self.send_json(
            {"ok": True},
            extra_headers=[("Set-Cookie", "aio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")],
        )

    def handle_auth_reset_password(self, payload):
        account = str(payload.get("account", "")).strip()
        old_password = str(payload.get("oldPassword", ""))
        new_password = str(payload.get("newPassword", ""))
        if not account or not old_password or not new_password:
            return self.send_json({"error": "请填写完整信息。"}, 400)
        if len(new_password) < 8:
            return self.send_json({"error": "新密码至少 8 位。"}, 400)
        if "@" in account:
            login_key = f"email:{account.lower()}"
        else:
            login_key = f"phone:{account.replace(' ', '').replace('-', '')}"
        users = load_users()
        user = next((u for u in users.values() if u.get("loginKey") == login_key), None)
        if not user:
            return self.send_json({"error": "该邮箱/手机号未注册。"}, 404)
        if not verify_password(old_password, user.get("passwordHash", "")):
            return self.send_json({"error": "原密码错误。"}, 401)
        user["passwordHash"] = hash_password(new_password)
        users[user["id"]] = user
        save_users(users)
        # 重置后让所有 session 失效（安全）
        sessions = prune_sessions(load_sessions())
        sessions = {tok: d for tok, d in sessions.items() if d.get("userId") != user["id"]}
        save_sessions(sessions)
        return self._issue_session(user, registered=False)

    def _issue_session(self, user: dict, registered: bool):
        token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
        expires_at = int(time.time()) + SESSION_TTL_SECONDS
        sessions = prune_sessions(load_sessions())
        sessions[token] = {"userId": user["id"], "expiresAt": expires_at,
                           "createdAt": int(time.time())}
        save_sessions(sessions)
        return self.send_json({
            "ok": True,
            "user": {
                "id": user["id"], "name": user["name"],
                "email": user.get("email"), "phone": user.get("phone"),
                "role": user.get("role"),
                "accountType": user.get("accountType"),
                "studentId": user.get("studentId"),
                "account": (user.get("loginKey") or "").split(":", 1)[-1] if user.get("loginKey") else None,
                "avatar": user.get("name", "用")[:1],
            },
            "registered": registered,
        }, extra_headers=[session_cookie_header(token, expires_at)])

    def receive_upload(self):
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            return self.send_json({"error": "资料上传目前只对本机开放。"}, 403)
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_json({"error": "上传请求长度无效。"}, 400)
        if length <= 0 or length > MAX_UPLOAD:
            return self.send_json({"error": "文件为空或超过 512 MB。"}, 413)
        raw_name = unquote(self.headers.get("X-Filename", "")).strip()
        name = Path(raw_name).name
        if not name or raw_name != name or name.startswith("."):
            return self.send_json({"error": "文件名不安全。"}, 400)
        if Path(name).suffix.lower() not in SUPPORTED_LIBRARY_SUFFIXES:
            return self.send_json({"error": "仅支持 PDF、Markdown、Word 和文本文件。"}, 415)
        target = LIBRARY_DIR / name
        if target.exists():
            return self.send_json({"error": "同名资料已存在，未覆盖原文件。"}, 409)
        temporary = tempfile.NamedTemporaryFile(prefix=".upload-", dir=LIBRARY_DIR, delete=False)
        temporary_path = Path(temporary.name)
        try:
            remaining = length
            while remaining:
                chunk = self.rfile.read(min(1024 * 1024, remaining))
                if not chunk:
                    raise OSError("incomplete upload")
                temporary.write(chunk)
                remaining -= len(chunk)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary.close()
            temporary_path.replace(target)
            return self.send_json({"uploaded": name, "size": length}, 201)
        except OSError:
            temporary.close()
            temporary_path.unlink(missing_ok=True)
            return self.send_json({"error": "文件上传未完成，请重试。"}, 500)

    def serve_document(self, raw_name, inline):
        try:
            path = safe_library_path(raw_name)
        except FileNotFoundError:
            return self.send_error(404, "Document not found")
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        disposition = "inline" if inline else "attachment"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(path.stat().st_size))
        self.send_header("Content-Disposition", f"{disposition}; filename*=UTF-8''{quote(path.name)}")
        self.end_headers()
        with path.open("rb") as source:
            shutil.copyfileobj(source, self.wfile)

    def serve_text(self, raw_name):
        try:
            path = safe_library_path(raw_name)
        except FileNotFoundError:
            return self.send_json({"error": "资料不存在。"}, 404)
        try:
            if path.suffix.lower() == ".md":
                text = path.read_text(encoding="utf-8", errors="replace")
            elif path.suffix.lower() == ".pdf":
                text = pdf_to_text(path)
            elif path.suffix.lower() == ".docx":
                with zipfile.ZipFile(path) as archive:
                    root = ET.fromstring(archive.read("word/document.xml"))
                text = "\n".join("".join(node.text or "" for node in paragraph.iter() if node.tag.endswith("}t")) for paragraph in root.iter() if paragraph.tag.endswith("}p"))
            elif path.suffix.lower() == ".txt":
                text = path.read_text(encoding="utf-8", errors="replace")
            else:
                text = "该文件类型请使用原文件预览。"
            return self.send_json({"title": path.stem, "type": path.suffix.lower(), "text": text[:500_000]})
        except (subprocess.SubprocessError, OSError, RuntimeError, zipfile.BadZipFile, ET.ParseError):
            return self.send_json({"error": "暂时无法提取该 PDF 的文字。"}, 500)

    def serve_archive(self):
        if not LIBRARY_DIR.is_dir():
            return self.send_json({"error": "参考文献目录不可用。"}, 503)
        temp = tempfile.SpooledTemporaryFile(max_size=32_000_000)
        with zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(LIBRARY_DIR.iterdir()):
                if path.is_file() and not path.name.startswith("."):
                    archive.write(path, arcname=path.name)
        size = temp.tell()
        temp.seek(0)
        self.send_response(200)
        self.send_header("Content-Type", "application/zip")
        self.send_header("Content-Disposition", "attachment; filename=course-references.zip")
        self.send_header("Content-Length", str(size))
        self.end_headers()
        shutil.copyfileobj(temp, self.wfile)

    def call_qwen(self, payload, translate=False):
        api_key, _ = dashscope_api_key()
        if not api_key:
            return self.send_json({"error": "AI 服务尚未配置。请在服务端环境变量或 macOS 钥匙串中配置千问 API Key。"}, 503)
        if not ai_request_allowed(self.client_address[0]):
            return self.send_json({"error": f"请求过于频繁，请在 {AI_RATE_WINDOW_SECONDS} 秒后再试。"}, 429)
        user_text = str(payload.get("text" if translate else "question", "")).strip()
        context = str(payload.get("context", ""))[:30_000]
        if not user_text:
            return self.send_json({"error": "请输入需要处理的内容。"}, 400)
        if translate:
            system = "你是课程文献翻译助手。忠实翻译为简体中文，保留术语、专名和段落结构，不补充原文没有的信息。"
            prompt = user_text[:15_000]
        else:
            system = "你是《人工智能与组织管理》课程阅读助手。只依据给定资料回答；资料不足时直说，并区分原文内容与推论。"
            prompt = f"资料片段：\n{context}\n\n问题：{user_text[:2000]}"
        messages = [{"role": "system", "content": system}]
        if not translate:
            for message in payload.get("history", [])[-8:]:
                role = message.get("role")
                content = str(message.get("content", ""))[:4000]
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": prompt})
        request_data = json.dumps({
            "model": os.getenv("QWEN_MODEL", "qwen-plus"),
            "messages": messages,
            "temperature": 0.2,
            "stream": False,
        }).encode()
        base = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
        req = urllib.request.Request(base + "/chat/completions", data=request_data, headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=90) as response:
                result = json.load(response)
            answer = result["choices"][0]["message"]["content"]
            return self.send_json({"answer": answer})
        except urllib.error.HTTPError as exc:
            messages = {
                401: "千问 API Key 无效或已失效，请更新服务端凭据。",
                403: "当前 API Key 没有调用该模型的权限。",
                429: "千问调用额度不足或请求过于频繁，请稍后再试。",
            }
            return self.send_json({"error": messages.get(exc.code, f"千问服务返回错误（HTTP {exc.code}）。")}, 502)
        except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError) as exc:
            return self.send_json({"error": f"AI 服务暂时不可用：{type(exc).__name__}"}, 502)

    # ───────────────── 小程序问答 / 微信登录（/v1） ─────────────────

    def handle_v1_ask(self, payload):
        """小程序【问答】模块后端：课程 RAG + 百炼 qwen3.7-plus。"""
        api_key, _ = dashscope_api_key()
        if not api_key:
            return self.send_json({"error": "AI 服务尚未配置。"}, 503)
        if not ai_request_allowed(self.client_address[0]):
            return self.send_json({"error": f"请求过于频繁，请在 {AI_RATE_WINDOW_SECONDS} 秒后再试。"}, 429)
        messages = payload.get("messages") if isinstance(payload, dict) else None
        if not isinstance(messages, list) or not messages:
            return self.send_json({"error": "缺少对话内容。"}, 400)
        last_user = next((m for m in reversed(messages) if m.get("role") == "user"), None)
        question = (last_user.get("content") if last_user else "") or ""
        if not question.strip():
            return self.send_json({"error": "请输入你的问题。"}, 400)
        attachments = payload.get("attachments") or []
        system_extra = (payload.get("system") or "")[:2000]
        context = retrieve_course_context(question, k=5)
        attachment_context = resolve_attachment_context(attachments)
        system = (
            "你是《人工智能与组织管理》课程助教，由教师于君博与助教徐亦恒维护，课程归属南京大学政府管理学院，共 16 周。"
            "请优先依据下方【课程资料】与【学生上传的材料】回答学生问题；资料不足时明确说明，并建议学生查阅原文或询问教师。"
            "不要编造课程政策、分数比例或教师未公布的安排。\n"
            f"{system_extra}\n\n【课程资料】\n{context}"
        )
        if attachment_context:
            system += "\n\n【学生上传的材料】\n" + attachment_context
        llm_messages = [{"role": "system", "content": system}]
        for m in messages[:-1]:
            role = m.get("role")
            content = str(m.get("content", ""))[:3000]
            if role in ("user", "assistant") and content:
                llm_messages.append({"role": role, "content": content})
        llm_messages.append({"role": "user", "content": question})
        request_data = json.dumps({
            "model": os.getenv("QWEN_ASK_MODEL", "qwen3.7-plus"),
            "messages": llm_messages,
            "temperature": 0.3,
            "stream": False,
        }).encode()
        base = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
        req = urllib.request.Request(
            base + "/chat/completions", data=request_data,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                result = json.load(resp)
            answer = result["choices"][0]["message"]["content"]
            return self.send_json({"reply": answer})
        except urllib.error.HTTPError as exc:
            messages_map = {
                401: "千问 API Key 无效或已失效，请更新服务端凭据。",
                403: "当前 API Key 没有调用该模型的权限。",
                429: "千问调用额度不足或请求过于频繁，请稍后再试。",
            }
            return self.send_json({"error": messages_map.get(exc.code, f"千问服务返回错误（HTTP {exc.code}）。")}, 502)
        except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError) as exc:
            return self.send_json({"error": f"AI 服务暂时不可用：{type(exc).__name__}"}, 502)

    def handle_v1_wechat_login(self, payload):
        """小程序微信登录：code → openid，颁发课程 session。"""
        code = str((payload or {}).get("code", "")).strip()
        if not code:
            return self.send_json({"error": "缺少微信登录凭证。"}, 400)
        appid = os.getenv("WX_APP_ID", "wx23b18a4b1624ec53")
        secret = os.getenv("WX_APP_SECRET", "")
        if not secret:
            return self.send_json({"error": "微信登录服务尚未配置（缺少 AppSecret）。"}, 503)
        url = (
            f"https://api.weixin.qq.com/sns/jscode2session?appid={appid}"
            f"&secret={secret}&js_code={code}&grant_type=authorization_code"
        )
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                wres = json.load(resp)
        except Exception:
            return self.send_json({"error": "微信登录服务暂时不可用。"}, 502)
        if wres.get("errcode", 0) not in (0, None):
            return self.send_json({"error": f"微信登录失败：{wres.get('errmsg', '未知错误')}"}, 502)
        openid = wres.get("openid")
        if not openid:
            return self.send_json({"error": "未取得用户标识。"}, 502)
        user = {
            "id": f"wx-{openid[-6:]}",
            "name": "微信用户",
            "role": "课程学生",
            "openid": openid,
            "avatar": "微",
        }
        token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
        expires_at = int(time.time()) + SESSION_TTL_SECONDS
        sessions = prune_sessions(load_sessions())
        sessions[token] = {
            "userId": user["id"], "openid": openid,
            "expiresAt": expires_at, "createdAt": int(time.time()),
        }
        save_sessions(sessions)
        return self.send_json(
            {"token": token, "user": user},
            extra_headers=[session_cookie_header(token, expires_at)],
        )

    def receive_v1_upload(self):
        """小程序附件上传（multipart），存 UPLOAD_DIR，返回可访问 url。"""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_json({"error": "上传长度无效。"}, 400)
        if length <= 0 or length > ASK_UPLOAD_MAX:
            return self.send_json({"error": "文件为空或超过 20 MB 限制。"}, 413)
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            return self.send_json({"error": "仅支持 multipart 上传。"}, 415)
        body = self.rfile.read(length)
        try:
            from email.parser import BytesParser
            from email.policy import default
            msg = BytesParser(policy=default).parsebytes(
                b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body
            )
        except Exception:
            return self.send_json({"error": "上传解析失败。"}, 400)
        saved = []
        for part in msg.walk():
            fn = part.get_filename()
            if not fn:
                continue
            data = part.get_payload(decode=True)
            if not data:
                continue
            name = Path(fn).name
            if name.startswith(".") or "/" in name or "\\" in name:
                continue
            suffix = Path(name).suffix.lower()
            if suffix not in SUPPORTED_ASK_SUFFIXES:
                return self.send_json({"error": f"不支持的文件类型：{suffix}"}, 415)
            safe_name = f"{int(time.time() * 1000)}_{secrets.token_hex(4)}{suffix}"
            (UPLOAD_DIR / safe_name).write_bytes(data)
            saved.append(safe_name)
        if not saved:
            return self.send_json({"error": "未收到文件。"}, 400)
        url = f"/v1/file?name={quote(saved[0])}"
        return self.send_json({"url": url, "name": saved[0], "files": saved})

    def receive_v1_asr(self):
        """小程序语音转写：multipart 音频 → 百炼 qwen3-asr-flash（Base64，同步）。"""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_json({"error": "上传长度无效。"}, 400)
        if length <= 0 or length > 10 * 1024 * 1024:
            return self.send_json({"error": "音频为空或超过 10 MB 限制。"}, 413)
        content_type = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in content_type:
            return self.send_json({"error": "仅支持 multipart 上传。"}, 415)
        body = self.rfile.read(length)
        try:
            from email.parser import BytesParser
            from email.policy import default
            msg = BytesParser(policy=default).parsebytes(
                b"Content-Type: " + content_type.encode() + b"\r\n\r\n" + body
            )
        except Exception:
            return self.send_json({"error": "上传解析失败。"}, 400)
        audio_bytes = None
        audio_mime = "audio/mpeg"
        for part in msg.walk():
            data = part.get_payload(decode=True)
            if not data:
                continue
            ctype = (part.get_content_type() or "").lower()
            if ctype.startswith("audio") or ctype.startswith("video"):
                audio_bytes = data
                audio_mime = ctype
                break
            fn = (part.get_filename() or "").lower()
            if fn.endswith((".mp3", ".wav", ".m4a", ".amr", ".aac", ".ogg", ".flac", ".mp4")):
                audio_bytes = data
                if fn.endswith(".wav"):
                    audio_mime = "audio/wav"
                elif fn.endswith(".m4a"):
                    audio_mime = "audio/mp4"
                elif fn.endswith(".amr"):
                    audio_mime = "audio/amr"
                break
        if not audio_bytes:
            return self.send_json({"error": "未找到音频数据。"}, 400)
        return self.transcribe_audio(audio_bytes, audio_mime)

    def transcribe_audio(self, audio_bytes, audio_mime):
        api_key, _ = dashscope_api_key()
        if not api_key:
            return self.send_json({"error": "语音识别服务尚未配置。"}, 503)
        if not ai_request_allowed(self.client_address[0]):
            return self.send_json({"error": f"请求过于频繁，请在 {AI_RATE_WINDOW_SECONDS} 秒后再试。"}, 429)
        data_uri = "data:%s;base64,%s" % (audio_mime, base64.b64encode(audio_bytes).decode())
        model = os.getenv("QWEN_ASR_MODEL", "qwen3-asr-flash")
        request_data = json.dumps({
            "model": model,
            "messages": [{
                "role": "user",
                "content": [{"type": "input_audio", "input_audio": {"data": data_uri}}],
            }],
            "stream": False,
            "asr_options": {"enable_itn": False},
        }).encode()
        base = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
        req = urllib.request.Request(
            base + "/chat/completions", data=request_data,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                result = json.load(resp)
            text = (result["choices"][0]["message"]["content"] or "").strip()
            if not text:
                return self.send_json({"error": "未能识别语音内容，请重试或改用文字输入。"}, 422)
            return self.send_json({"text": text})
        except urllib.error.HTTPError as exc:
            messages_map = {
                401: "千问 API Key 无效或已失效，请更新服务端凭据。",
                403: "当前 API Key 没有调用语音识别模型的权限。",
                429: "语音识别请求过于频繁，请稍后再试。",
            }
            return self.send_json({"error": messages_map.get(exc.code, f"语音识别服务返回错误（HTTP {exc.code}）。")}, 502)
        except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError) as exc:
            return self.send_json({"error": f"语音识别暂时不可用：{type(exc).__name__}"}, 502)

    def serve_uploaded_file(self, name):
        """返回已上传的附件（供回显 / 后端读取）。"""
        if not name or "/" in name or "\\" in name or name.startswith("."):
            return self.send_error(400)
        path = (UPLOAD_DIR / name).resolve()
        if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
            return self.send_error(404)
        mime = mimetypes.guess_type(name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "private, max-age=3600")
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print(f"Course platform: http://{HOST}:{PORT}/index.html")
    ThreadingHTTPServer((HOST, PORT), CourseHandler).serve_forever()
