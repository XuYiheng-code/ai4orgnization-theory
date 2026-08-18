// viewer.js — 项目课程详情页
// 行为：URL ?id=xxx 加载项目；当前用户（localStorage plazaUserName）与 owner.name 比较决定权限。
(function viewer() {
  const params = new URLSearchParams(location.search);
  const projectId = params.get('id') || '';
  if (!projectId) {
    document.getElementById('viewer-title').textContent = '缺少项目 ID';
    document.getElementById('viewer-lead').textContent = '请从项目课程页进入。';
    return;
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }

  // 登录态：优先用 /api/auth/me；未登录用 localStorage 昵称（兼容）
  const USER_KEY = 'aio-plaza-user-name';
  let currentUser = null; // 服务端登录用户

  function getUserName() {
    if (currentUser) return currentUser.name;
    try { return localStorage.getItem(USER_KEY) || ''; } catch { return ''; }
  }
  function setUserName(name) {
    try { localStorage.setItem(USER_KEY, name || ''); } catch {}
    if (state.project) renderPermission(state.project);
  }

  // 拉取服务端登录态
  fetch('/api/auth/me', { credentials: 'include' })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(data => {
      if (data && data.user) {
        currentUser = data.user;
        if (state.project) renderPermission(state.project);
      }
    })
    .catch(() => {});

  const state = { project: null, canEditCover: false };

  const COVER_PALETTE = ["#0a407a", "#1f5b57", "#df7625", "#153f3c", "#5b3a8c", "#b54a32"];

  async function loadProject() {
    const title = document.getElementById('viewer-title');
    const lead = document.getElementById('viewer-lead');
    try {
      const res = await fetch(`/api/plaza/project/${encodeURIComponent(projectId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      state.project = data.project;
      document.title = `${data.project.title}｜知识广场`;
      title.textContent = data.project.title;
      lead.textContent = data.project.subtitle || '';
      renderProject(data.project);
      renderSlides(data.project);
      renderComments(data.project);
      renderPermission(data.project);
    } catch (error) {
      title.textContent = '项目加载失败';
      lead.textContent = error.message;
    }
  }

  function renderProject(p) {
    renderCover(p);
    document.getElementById('viewer-tags').innerHTML = (p.tags || [])
      .map(t => `<span class="plaza-tag">${escapeHtml(t)}</span>`).join('');
    document.getElementById('viewer-views-count').textContent = p.views || 0;
    const likeBtn = document.getElementById('viewer-like');
    likeBtn.classList.toggle('is-liked', !!p.liked);
    likeBtn.querySelector('svg').setAttribute('fill', p.liked ? 'currentColor' : 'none');
    likeBtn.setAttribute('aria-pressed', String(!!p.liked));
    document.getElementById('viewer-like-count').textContent = p.likes || 0;
    const commentCount = (p.comments || []).length;
    document.getElementById('viewer-comments-count').textContent = commentCount;
    document.getElementById('viewer-comments-count-2').textContent = commentCount;

    // 侧边栏 4 张信息卡
    renderSideCards(p);

    // OpenMAIC iframe 嵌入（两个平台打通）
    renderMaicEmbed(p);
  }

  function renderSideCards(p) {
    // 卡 1：统计
    document.getElementById('side-views').textContent = p.views || 0;
    document.getElementById('side-likes').textContent = p.likes || 0;
    document.getElementById('side-comments').textContent = (p.comments || []).length;
    document.getElementById('side-date').textContent = (p.createdAt || '').slice(5) || '—';

    // 卡 2：作者
    document.getElementById('side-avatar').textContent = p.owner?.avatar || (p.owner?.name || '学').slice(0, 1);
    document.getElementById('side-owner-name').textContent = p.owner?.name || '学习者';
    document.getElementById('side-owner-role').textContent = p.owner?.role || '项目主理人';
    document.getElementById('side-tags').innerHTML = (p.tags || [])
      .map(t => `<span class="plaza-tag">${escapeHtml(t)}</span>`).join('');
  }

  // OpenMAIC 基地址：本地开发用 127.0.0.1:3100；线上同域部署时复用当前页面 host，
  // 使远程同学也能在浏览器中打开完整课程，而非写死的本地地址。
  function resolveOpenMaicBase() {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    return isLocal ? 'http://127.0.0.1:3100' : `${window.location.protocol}//${window.location.host}`;
  }

  function renderMaicEmbed(p) {
    const frame = document.getElementById('viewer-maic-frame');
    const empty = document.getElementById('viewer-maic-empty');
    const openLink = document.getElementById('viewer-maic-open');
    // 优先用 sourceStageId；老数据用 project id 前缀清洗
    let stageId = p.sourceStageId || p.id.replace(/^p-/, '');
    // OpenMAIC stageId 一般是 "stage-xxxx" 或自定义，去掉 p-imported- 前缀
    if (stageId.startsWith('p-imported-') && p.sourceStageId) stageId = p.sourceStageId;
    const base = resolveOpenMaicBase();
    const openmaicUrl = stageId
      ? `${base}/classroom/${encodeURIComponent(stageId)}`
      : `${base}/`;
    if (stageId) {
      frame.src = openmaicUrl;
      frame.classList.remove('hidden');
      empty.classList.add('hidden');
    } else {
      frame.removeAttribute('src');
      frame.classList.add('hidden');
      empty.classList.remove('hidden');
    }
    openLink.href = openmaicUrl;
    openLink.dataset.stageId = stageId || '';
  }

  function renderSlides(p) {
    const intro = document.getElementById('viewer-slides-intro');
    const list = document.getElementById('viewer-slides-list');
    const slides = p.slides || [];
    if (slides.length === 0) {
      intro.textContent = '该课程尚未同步内容快照。点击下方"在 OpenMAIC 中编辑"可补充内容（仅发布者本人可见）。';
      list.innerHTML = '';
      return;
    }
    intro.textContent = `共 ${slides.length} 页。每页展示作者发布到知识广场时的文字内容快照。`;
    list.innerHTML = slides
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((s, i) => `
        <article class="viewer-slide">
          <div class="viewer-slide-number">${String(i + 1).padStart(2, '0')}</div>
          <div class="viewer-slide-body">
            <h3>${escapeHtml(s.title || `场景 ${i + 1}`)}</h3>
            <div class="viewer-slide-content">${formatContent(s.content)}</div>
          </div>
        </article>
      `).join('');
  }

  // 简单 markdown 渲染：换行、列表、加粗
  function formatContent(text) {
    if (!text) return '<p class="viewer-slide-empty">（此页暂无文字内容）</p>';
    const lines = String(text).split('\n');
    const html = [];
    let listBuffer = [];
    const flushList = () => {
      if (listBuffer.length) {
        html.push('<ul>' + listBuffer.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>');
        listBuffer = [];
      }
    };
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { flushList(); continue; }
      if (/^[-*]\s+/.test(trimmed)) {
        listBuffer.push(trimmed.replace(/^[-*]\s+/, ''));
        continue;
      }
      flushList();
      html.push(`<p>${inline(trimmed)}</p>`);
    }
    flushList();
    return html.join('') || '<p class="viewer-slide-empty">（此页暂无文字内容）</p>';
  }
  function inline(text) {
    return escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function renderComments(p) {
    const list = document.getElementById('viewer-comments-list');
    const comments = p.comments || [];
    if (comments.length === 0) {
      list.innerHTML = '<div class="plaza-comment-empty">还没有评论。欢迎留下第一条观察。</div>';
      return;
    }
    list.innerHTML = comments.map(c => `
      <div class="plaza-comment">
        <div class="plaza-comment-avatar">${escapeHtml(c.avatar || (c.author || '学').slice(0, 1))}</div>
        <div class="plaza-comment-body">
          <div class="plaza-comment-meta">
            <strong>${escapeHtml(c.author || '学习者')}</strong>
            <time>${escapeHtml(c.time || '')}</time>
          </div>
          <p>${escapeHtml(c.text)}</p>
        </div>
      </div>`).join('');
  }

  function renderPermission(p) {
    const permEl = document.getElementById('viewer-permission');
    const permText = document.getElementById('viewer-permission-text');
    const editCta = document.getElementById('viewer-edit-cta');
    const editLink = document.getElementById('viewer-edit-link');

    // 侧边栏权限卡（永久显示）
    const sideBadge = document.getElementById('side-perm-badge');
    const sideLabel = document.getElementById('side-perm-label');
    const sideDetail = document.getElementById('side-perm-detail');
    const sideCard = document.getElementById('side-permission');

    const userName = getUserName();
    const ownerName = p.owner?.name || '';
    // 与服务端 handle_plaza_cover 的归属判定保持一致：
    // ownerUserId 命中登录 id，或 ownerUserId 为空(演示样本/早期跨平台未带凭证发布)
    // 且 owner.name 与当前登录名一致，均视为发布者本人。
    const isOwner = currentUser
      ? (p.ownerUserId === currentUser.id || (!p.ownerUserId && (p.owner?.name || '') === currentUser.name))
      : !!(userName && ownerName && userName === ownerName);

    // 顶部权限条（保留简短版）
    permEl.classList.remove('hidden', 'is-owner', 'is-guest');
    if (isOwner) {
      permEl.classList.add('is-owner');
      permText.textContent = `你是发布者「${ownerName}」本人。可在 OpenMAIC 中编辑。`;
      editCta.classList.remove('hidden');
      const stageId = p.sourceStageId || p.id.replace(/^p-/, '');
      editLink.href = `${resolveOpenMaicBase()}/classroom/${encodeURIComponent(stageId)}`;
    } else {
      permEl.classList.add('is-guest');
      permText.textContent = currentUser
        ? `当前登录「${currentUser.name}」与发布者不同。只能观看与评论。`
        : (userName
          ? `当前身份「${userName}」与发布者不同。只能观看与评论。`
          : '请先登录或设置昵称，匹配发布者本人才能看到"在 OpenMAIC 中编辑"入口。');
      editCta.classList.add('hidden');
    }

    // 侧边栏权限卡
    sideBadge.classList.remove('is-owner', 'is-guest', 'is-anon');
    if (isOwner) {
      sideBadge.classList.add('is-owner');
      sideLabel.textContent = '发布者本人';
      sideDetail.textContent = currentUser
        ? `已登录 ${currentUser.name}，与发布者本人匹配。可在 OpenMAIC 中编辑此课程。`
        : '当前本地身份与发布者本人匹配。可在 OpenMAIC 中编辑此课程。';
    } else if (currentUser) {
      sideBadge.classList.add('is-guest');
      sideLabel.textContent = '同学';
      sideDetail.textContent = `已登录 ${currentUser.name}。可观看、点赞与评论，但不能直接编辑。`;
    } else if (userName) {
      sideBadge.classList.add('is-guest');
      sideLabel.textContent = '同学';
      sideDetail.textContent = `当前本地身份「${userName}」与发布者不同。只能观看与评论。`;
    } else {
      sideBadge.classList.add('is-anon');
      sideLabel.textContent = '未登录';
      sideDetail.textContent = '登录后可解锁更多权限：点赞、评论、发布者身份识别。';
    }
    sideCard.classList.remove('hidden');
    updateCoverEditorVisibility(p);
  }

  // ───────────────── 封面渲染与编辑 ─────────────────
  function renderCover(p) {
    const cover = document.getElementById('viewer-cover');
    const inner = document.getElementById('viewer-cover-inner');
    const titleEl = document.getElementById('viewer-cover-title');
    const subEl = document.getElementById('viewer-cover-sub');
    const ownerEl = document.getElementById('viewer-cover-owner');
    if (!cover) return;
    const c = p.cover || '#1f5b57';
    const isImage = typeof c === 'string' && (c.startsWith('data:image') || c.startsWith('/'));
    if (isImage) {
      // 海报已自带标题/作者，不再叠加文字
      cover.style.backgroundImage = `url('${c.replace(/'/g, "\\'")}')`;
      cover.style.backgroundSize = 'cover';
      cover.style.backgroundPosition = 'center';
      cover.style.backgroundColor = '';
      inner.style.display = 'none';
      ownerEl.style.display = 'none';
    } else {
      cover.style.backgroundImage = 'none';
      cover.style.backgroundColor = c;
      inner.style.display = '';
      ownerEl.style.display = (p.owner && p.owner.name) ? '' : 'none';
      titleEl.textContent = p.title || '';
      subEl.textContent = p.subtitle || '';
      ownerEl.textContent = (p.owner && p.owner.name) ? `发布者：${p.owner.name}` : '';
    }
  }

  let coverEditorWired = false;

  function wireCoverEditor() {
    if (coverEditorWired) return;
    coverEditorWired = true;
    const themes = document.getElementById('viewer-cover-themes');
    if (themes) {
      themes.innerHTML = COVER_PALETTE.map((col, i) =>
        `<button type="button" class="cover-swatch" data-theme="${i}" style="background:${col}" title="主题色 ${col}" aria-label="主题色 ${col}"></button>`
      ).join('');
      themes.addEventListener('click', event => {
        const btn = event.target.closest('[data-theme]');
        if (btn) updateCover({ action: 'generate', theme: Number(btn.dataset.theme) });
      });
    }
    document.getElementById('cover-generate')?.addEventListener('click', () => updateCover({ action: 'generate' }));
    document.getElementById('cover-reset')?.addEventListener('click', () => {
      const c = state.project && state.project.cover;
      updateCover({ cover: (typeof c === 'string' && c.startsWith('#')) ? c : '#1f5b57' });
    });
    const upload = document.getElementById('cover-upload');
    upload?.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (file) handleCoverUpload(file);
      event.target.value = '';
    });
  }

  function updateCoverEditorVisibility(p) {
    const editor = document.getElementById('viewer-cover-editor');
    if (!editor) return;
    const serverOwner = currentUser
      ? (p.ownerUserId === currentUser.id || (!p.ownerUserId && (p.owner?.name || '') === currentUser.name))
      : false;
    state.canEditCover = serverOwner;
    if (serverOwner) {
      editor.classList.remove('hidden');
      wireCoverEditor();
    } else {
      editor.classList.add('hidden');
    }
  }

  async function updateCover(body) {
    if (!state.project) return;
    if (!state.canEditCover) {
      showToast('请先在课程平台以发布者身份登录，再修改封面。');
      return;
    }
    try {
      const res = await fetch(`/api/plaza/cover/${encodeURIComponent(state.project.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');
      state.project.cover = data.cover;
      renderCover(state.project);
      showToast('封面已更新');
    } catch (err) {
      showToast(err.message || '封面更新失败');
    }
  }

  function handleCoverUpload(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1280;
        let { width, height } = img;
        if (width > maxW) {
          height = Math.round(height * maxW / width);
          width = maxW;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        updateCover({ cover: dataUrl });
      };
      img.onerror = () => showToast('图片无法读取');
      img.src = reader.result;
    };
    reader.onerror = () => showToast('文件读取失败');
    reader.readAsDataURL(file);
  }

  // 点赞
  document.getElementById('viewer-like')?.addEventListener('click', async () => {
    if (!state.project) return;
    const btn = document.getElementById('viewer-like');
    const isCurrentlyLiked = btn.classList.contains('is-liked');
    const next = !isCurrentlyLiked;
    const delta = next ? 1 : -1;
    // 乐观更新
    btn.classList.toggle('is-liked', next);
    btn.setAttribute('aria-pressed', String(next));
    btn.querySelector('svg').setAttribute('fill', next ? 'currentColor' : 'none');
    state.project.liked = next;
    state.project.likes = Math.max(0, (state.project.likes || 0) + delta);
    document.getElementById('viewer-like-count').textContent = state.project.likes;
    try {
      const res = await fetch('/api/plaza/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: state.project.id, action: next ? 'on' : 'off' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      state.project.liked = !!data.liked;
      state.project.likes = Number(data.likes) || state.project.likes;
      btn.classList.toggle('is-liked', state.project.liked);
      document.getElementById('viewer-like-count').textContent = state.project.likes;
    } catch (err) {
      // 回滚
      state.project.liked = isCurrentlyLiked;
      state.project.likes = Math.max(0, state.project.likes - delta);
      btn.classList.toggle('is-liked', isCurrentlyLiked);
      document.getElementById('viewer-like-count').textContent = state.project.likes;
      showToast(err.message || '点赞失败');
    }
  });

  // 评论
  document.getElementById('viewer-comment-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.project) return;
    const input = document.getElementById('viewer-comment-input');
    const hint = document.getElementById('viewer-comment-hint');
    const text = (input.value || '').trim();
    if (!text) { hint.textContent = '请先写下你的观察。'; return; }
    const author = getUserName() || '同学';
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const res = await fetch('/api/plaza/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: state.project.id, text, author }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      state.project.comments = state.project.comments || [];
      state.project.comments.push(data.comment);
      renderComments(state.project);
      document.getElementById('viewer-comments-count').textContent = data.commentCount;
      document.getElementById('viewer-comments-count-2').textContent = data.commentCount;
      input.value = '';
      hint.textContent = '已发送，欢迎继续交流。';
      showToast('评论已发布');
    } catch (err) {
      hint.textContent = err.message || '发送失败';
    } finally {
      submitBtn.disabled = false;
    }
  });

  loadProject();
})();
