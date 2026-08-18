const menuButton = document.querySelector('.menu-button');
const nav = document.querySelector('.nav');
if (menuButton && nav) {
  menuButton.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuButton.setAttribute('aria-expanded', String(open));
  });
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menuButton.setAttribute('aria-expanded', 'false');
  }));
}

document.querySelectorAll('[data-year]').forEach(node => node.textContent = new Date().getFullYear());

// ── 顶栏登录状态感知：未登录显示"登录"，已登录显示用户名+退出菜单 ──
(function authHeader() {
  const loginLink = document.querySelector('[data-auth-login]');
  if (!loginLink) return;
  fetch('/api/auth/me', { credentials: 'include' })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      const user = data && data.user;
      if (!user) return; // 未登录，保持原"登录"链接
      // 已登录：替换为"用户名 + 退出"按钮组
      const wrap = document.createElement('div');
      wrap.className = 'header-user';
      wrap.innerHTML = `
        <button type="button" class="header-user-button" aria-haspopup="true" aria-expanded="false">
          <span class="header-user-avatar">${escapeHtml(user.avatar || (user.name || '用').slice(0, 1))}</span>
          <span class="header-user-name">${escapeHtml(user.name)}</span>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="header-user-menu" role="menu" hidden>
          <div class="header-user-menu-meta">
            <strong>${escapeHtml(user.name)}</strong>
            <small>${escapeHtml(user.role || '')}${user.studentId ? ' · 学号 ' + escapeHtml(user.studentId) : ''}</small>
          </div>
          <a class="header-user-menu-link" href="/projects.html">我的项目</a>
          <button type="button" class="header-user-menu-link is-danger" data-logout>退出登录</button>
        </div>
      `;
      loginLink.replaceWith(wrap);
      const button = wrap.querySelector('.header-user-button');
      const menu = wrap.querySelector('.header-user-menu');
      button.addEventListener('click', () => {
        const open = menu.hidden;
        menu.hidden = !open;
        button.setAttribute('aria-expanded', String(open));
      });
      document.addEventListener('click', e => {
        if (!wrap.contains(e.target)) {
          menu.hidden = true;
          button.setAttribute('aria-expanded', 'false');
        }
      });
      wrap.querySelector('[data-logout]').addEventListener('click', async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
          showToast('已退出登录');
          setTimeout(() => location.reload(), 400);
        } catch {
          showToast('退出失败', true);
        }
      });
    })
    .catch(() => { /* 网络错误时保留登录链接 */ });
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  }
})();

const weekIntroductions = [
  '从组织为何产生、如何延续与为何衰退出发，建立贯穿全课的基本问题，并说明人工智能为什么首先是一个组织问题。',
  '把有限理性与机器学习放在一起比较，理解自动化决策能替代哪些判断，又会制造哪些新的偏误与责任难题。',
  '解释组织如何搜集、传递和使用信息，并以大语言模型为例考察知识检索、生成与幻觉对组织记忆的影响。',
  '分析组织对外部资源和平台的依赖，讨论公共部门采用云服务与 AI 系统时如何处理能力、议价权和长期锁定。',
  '考察算法如何进入绩效、排班与任务分配，比较它与科层、市场和文化控制的差异及其对员工自主性的影响。',
  '从团队动力与工作流入手，识别人和 AI 在分工、交接、复核中的互补关系，以及协作失灵最常出现的位置。',
  '讨论管理者如何把 AI 项目与组织战略、数据条件和一线实践对齐，并理解技术变革为何经常停在试点阶段。',
  '围绕学生案例进行中期诊断，用角色模拟和提示词迭代检验利益相关者分析，形成可继续推进的协作方案。',
  '观察算法进入一线行政裁量后，规则执行、专业判断与应对策略如何变化，并讨论谁应为系统决定负责。',
  '用公共价值框架审视 AI 服务设计，判断效率、公平、可及性和信任之间的取舍是否得到充分说明。',
  '解释组织为何会以仪式性方式采用新技术，识别制度压力、表面合规与真实能力建设之间的脱节。',
  '把数字公共基础设施视为跨组织平台，讨论标准、接口、数据共享和公共性如何共同塑造政府能力。',
  '从数据与模型两端识别偏差，比较不同公平定义，并理解代表性官僚制对算法审计提出的组织要求。',
  '把自动化决策放回行政程序与司法审查，分析告知、解释、申诉和人工复核应如何进入系统设计。',
  '比较不同监管工具与技术政策，讨论风险分级、监管沙盒和多方参与各自适用的条件与局限。',
  '整合全课理论与案例证据，展示 AI 落地路线图，说明组织设计、技术可行性、公共价值与合规责任如何相互约束。'
];
document.querySelectorAll('details.week').forEach((week, index) => {
  const inner = week.querySelector('.week-body-inner');
  if (!inner || !weekIntroductions[index]) return;
  const intro = document.createElement('div');
  intro.className = 'week-intro';
  intro.innerHTML = `<h4>课程简介</h4><p>${weekIntroductions[index]}</p>`;
  inner.prepend(intro);
});

const logoMotion = document.querySelector('[data-logo-motion]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (logoMotion && !reducedMotion) {
  const logoStage = logoMotion.querySelector('.logo-lab');
  const replay = logoMotion.querySelector('[data-logo-replay]');
  logoMotion.addEventListener('pointermove', event => {
    const rect = logoMotion.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    logoStage.style.setProperty('--tilt-x', `${(-y * 4).toFixed(2)}deg`);
    logoStage.style.setProperty('--tilt-y', `${(x * 4).toFixed(2)}deg`);
  });
  logoMotion.addEventListener('pointerleave', () => {
    logoStage.style.setProperty('--tilt-x', '0deg');
    logoStage.style.setProperty('--tilt-y', '0deg');
  });
  replay.addEventListener('click', () => {
    logoStage.classList.remove('is-assembling');
    void logoStage.offsetWidth;
    logoStage.classList.add('is-assembling');
  });
}

const libraryList = document.getElementById('library-list');
if (libraryList) {
  const search = document.getElementById('library-search');
  const type = document.getElementById('library-type');
  const empty = document.getElementById('library-empty');
  let concept = 'all';
  let library = [];
  const render = () => {
    const query = search.value.trim().toLowerCase();
    const items = library.filter(item =>
      (type.value === 'all' || item.type === type.value) &&
      (concept === 'all' || item.concepts.includes(concept)) &&
      `${item.title} ${item.note}`.toLowerCase().includes(query)
    );
    const btn = (href, label, cls, disabled) => disabled
      ? `<span class="lib-btn ${cls} is-disabled" aria-disabled="true">${label}<em>即将上线</em></span>`
      : `<a class="lib-btn ${cls}" href="${href}">${label}</a>`;
    libraryList.innerHTML = items.map(item => {
      const readHref = `reader.html?file=${encodeURIComponent(item.file)}&title=${encodeURIComponent(item.title)}`;
      const dlHref = `/api/download?file=${encodeURIComponent(item.file)}`;
      return `
      <article class="library-item">
        <div class="lib-code">${item.code}</div>
        <div class="lib-main">
          <h3>${item.title}</h3>
          <p>${item.note}</p>
          <span class="lib-type">${item.label}</span>
        </div>
        <div class="lib-actions">
          ${btn(readHref, "在线阅读", "lib-read", false)}
          ${btn(dlHref, "下载", "lib-dl", false)}
          ${btn(item.guideUrl, "文献梳理", "lib-guide", !item.hasGuide)}
          ${btn(item.lectureUrl, "课程讲解", "lib-lecture", !item.hasLecture)}
        </div>
      </article>`;
    }).join('');
    const count = document.getElementById('library-count');
    if (count) count.textContent = `${items.length} 项资料`;
    empty.style.display = items.length ? 'none' : 'block';
  };
  const loadLibrary = async () => {
    const response = await fetch('/api/library');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    library = data.items || [];
    render();
    const count = document.getElementById('library-count');
    if (count) count.textContent = `${library.length} 项资料 · ${data.files} 个文件`;
  };
  search.addEventListener('input', render);
  type.addEventListener('change', render);
  document.querySelectorAll('.concept-button').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.concept-button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    concept = button.dataset.concept;
    render();
  }));
  loadLibrary().catch(() => {
    libraryList.innerHTML = '<div class="notice">资料目录暂时无法连接。课程服务会自动恢复，请稍后刷新页面。</div>';
    const count = document.getElementById('library-count');
    if (count) count.textContent = '连接中断';
  });
  document.getElementById('download-all')?.addEventListener('click', () => {
    window.location.href = '/api/download-all';
    showToast('正在打包课程参考文献，文件较大，请稍候。');
  });
  const uploadInput = document.getElementById('library-upload-input');
  document.getElementById('library-upload')?.addEventListener('click', () => uploadInput.click());
  uploadInput?.addEventListener('change', async () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    const button = document.getElementById('library-upload');
    button.disabled = true;
    button.textContent = '正在上传…';
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream'},
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '上传失败。');
      await loadLibrary();
      showToast(`已上传：${result.uploaded}`);
    } catch (error) {
      showToast(error.message || '上传失败。');
    } finally {
      uploadInput.value = '';
      button.disabled = false;
      button.textContent = '上传资料';
    }
  });
}

const readerDocument = document.getElementById('reader-document');
if (readerDocument) {
  const params = new URLSearchParams(location.search);
  const file = params.get('file') || '';
  const title = params.get('title') || file.replace(/\.[^.]+$/, '');
  const documentText = document.getElementById('document-text');
  const pdfFrame = document.getElementById('pdf-frame');
  const status = document.getElementById('reader-status');
  const workspace = document.getElementById('reader-workspace');
  const context = { text: '', chunks: [], chunkIndex: 0, selection: '' };
  const history = [];
  document.getElementById('reader-title').textContent = title;
  document.getElementById('reader-meta').textContent = file.toLowerCase().endsWith('.pdf') ? 'PDF · 课程知识广场' : 'MARKDOWN · 课程知识广场';
  document.getElementById('reader-download').href = `/api/download?file=${encodeURIComponent(file)}`;
  const isPdf = file.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    pdfFrame.src = `/api/document?file=${encodeURIComponent(file)}`;
    pdfFrame.classList.add('visible');
  }
  const escapeHtml = value => value.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const renderMarkdown = value => escapeHtml(value).split('\n').map(line => {
    const heading = line.match(/^(#{1,4})\s+(.+)/);
    if (heading) return `<h${heading[1].length}>${heading[2]}</h${heading[1].length}>`;
    if (/^[-*]\s+/.test(line)) return `<p class="md-list">${line.replace(/^[-*]\s+/, '• ')}</p>`;
    return line.trim() ? `<p>${line}</p>` : '<br>';
  }).join('');
  const updateChunk = () => {
    const chunk = context.chunks[context.chunkIndex] || '';
    document.getElementById('parallel-source').textContent = chunk || '正在读取原文。';
    document.getElementById('translation-progress').textContent = `片段 ${context.chunkIndex + 1} / ${Math.max(context.chunks.length, 1)}`;
    document.getElementById('translation-result').textContent = localStorage.getItem(`aio-translation:${file}:${context.chunkIndex}`) || '点击“翻译当前片段”，译文会出现在这里。';
  };
  fetch(`/api/text?file=${encodeURIComponent(file)}`).then(response => response.json()).then(data => {
    if (data.error) throw new Error(data.error);
    context.text = data.text || '';
    context.chunks = context.text.match(/[\s\S]{1,6000}(?=\n\n|$)/g) || [context.text];
    status.hidden = true;
    if (!isPdf) {
      documentText.innerHTML = renderMarkdown(context.text);
      documentText.classList.add('visible');
    }
    updateChunk();
  }).catch(error => {
    if (isPdf) {
      status.hidden = true;
      document.getElementById('selection-hint').textContent = 'PDF 已打开；当前无法提取文字用于翻译或问答';
    } else {
      status.textContent = error.message;
    }
  });
  let zoom = 100;
  const updateZoom = () => {
    document.documentElement.style.setProperty('--reader-scale', String(zoom / 100));
    document.getElementById('reader-zoom').textContent = `${zoom}%`;
  };
  document.getElementById('reader-smaller').addEventListener('click', () => { zoom = Math.max(80, zoom - 10); updateZoom(); });
  document.getElementById('reader-larger').addEventListener('click', () => { zoom = Math.min(140, zoom + 10); updateZoom(); });
  document.addEventListener('selectionchange', () => {
    const selection = String(window.getSelection()).trim();
    if (selection && selection.length < 12000 && readerDocument.contains(window.getSelection()?.anchorNode)) {
      context.selection = selection;
      document.getElementById('selection-hint').textContent = `已选中 ${selection.length} 字`;
    }
  });
  const openPane = name => {
    document.getElementById(`${name}-pane`).hidden = false;
    workspace.classList.add(`${name}-open`);
    document.getElementById(name === 'translation' ? 'toggle-translation' : 'toggle-ai').classList.add('active');
  };
  const closePane = name => {
    document.getElementById(`${name}-pane`).hidden = true;
    workspace.classList.remove(`${name}-open`);
    document.getElementById(name === 'translation' ? 'toggle-translation' : 'toggle-ai').classList.remove('active');
  };
  document.getElementById('toggle-translation').addEventListener('click', () => document.getElementById('translation-pane').hidden ? openPane('translation') : closePane('translation'));
  document.getElementById('toggle-ai').addEventListener('click', () => document.getElementById('ai-pane').hidden ? openPane('ai') : closePane('ai'));
  document.querySelectorAll('[data-close-pane]').forEach(button => button.addEventListener('click', () => closePane(button.dataset.closePane)));
  const callAssistant = async (path, body, button) => {
    button.disabled = true;
    try {
      const response = await fetch(path, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      const data = await response.json();
      return data.answer || data.error || '没有收到结果。';
    } catch (error) { return '无法连接本地 AI 服务。请通过 server.py 启动课程站。'; }
    finally { button.disabled = false; }
  };
  const translateText = async (text, cacheKey, button) => {
    if (!text) return showToast('当前没有可翻译的文字。');
    openPane('translation');
    document.getElementById('parallel-source').textContent = text;
    const result = document.getElementById('translation-result');
    const cached = localStorage.getItem(cacheKey);
    if (cached && !/(尚未配置|无法连接|暂时不可用|请求过于频繁|额度不足|错误)/.test(cached)) {
      result.textContent = cached;
      return;
    }
    result.textContent = '正在翻译……';
    const answer = await callAssistant('/api/translate', {text}, button);
    result.textContent = answer;
    if (!/(尚未配置|无法连接|暂时不可用|请求过于频繁|额度不足|错误)/.test(answer)) localStorage.setItem(cacheKey, answer);
  };
  document.getElementById('translate-current').addEventListener('click', event => translateText(context.chunks[context.chunkIndex] || '', `aio-translation:${file}:${context.chunkIndex}`, event.currentTarget));
  document.getElementById('translate-selection').addEventListener('click', event => {
    if (!context.selection) return showToast('请先在原文中选中一段文字。');
    translateText(context.selection, `aio-translation:${file}:selection:${context.selection.slice(0, 80)}`, event.currentTarget);
  });
  document.getElementById('translation-prev').addEventListener('click', () => { context.chunkIndex = Math.max(0, context.chunkIndex - 1); updateChunk(); });
  document.getElementById('translation-next').addEventListener('click', () => { context.chunkIndex = Math.min(context.chunks.length - 1, context.chunkIndex + 1); updateChunk(); });
  document.querySelectorAll('.suggested-questions button').forEach(button => button.addEventListener('click', () => { document.getElementById('ask-input').value = button.textContent; }));
  const appendMessage = (role, content) => {
    const message = document.createElement('div');
    message.className = `chat-message ${role}`;
    if (role === 'assistant') {
      const safe = escapeHtml(content)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .split(/\n{2,}/)
        .map(block => {
          const lines = block.split('\n');
          if (lines.every(line => /^\s*[-*]\s+/.test(line))) {
            return `<ul>${lines.map(line => `<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`).join('')}</ul>`;
          }
          return `<p>${lines.join('<br>')}</p>`;
        }).join('');
      message.innerHTML = safe;
    } else {
      message.textContent = content;
    }
    document.getElementById('chat-thread').append(message);
    message.scrollIntoView({block: 'end', behavior: 'smooth'});
  };
  document.getElementById('chat-form').addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('ask-input');
    const question = input.value.trim();
    if (!question) return;
    openPane('ai');
    appendMessage('user', question);
    input.value = '';
    const answer = await callAssistant('/api/ask', {question, context: context.selection || context.text.slice(0, 30000), history}, document.getElementById('ask-button'));
    appendMessage('assistant', answer);
    history.push({role: 'user', content: question}, {role: 'assistant', content: answer});
  });
  document.getElementById('ask-input').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.getElementById('chat-form').requestSubmit(); }
  });
}

const loginForm = document.getElementById('demo-login-form');
if (loginForm) {
  const loginCard = document.getElementById('login-card');
  const dashboard = document.getElementById('dashboard');
  const account = document.getElementById('demo-account');
  const dashUser = document.getElementById('dash-user');
  const greeting = document.getElementById('dash-greeting');
  const roleLabel = document.getElementById('dash-role-label');
  const avatar = document.getElementById('dash-avatar');
  let role = 'student';
  document.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-role]').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    role = button.dataset.role;
    account.value = role === 'teacher' ? '演示教师' : '演示学生';
  }));
  const switchView = view => {
    document.querySelectorAll('.dash-view').forEach(item => item.hidden = item.dataset.view !== view);
    document.querySelectorAll('[data-dash]').forEach(item => item.classList.toggle('active', item.dataset.dash === view));
  };
  document.querySelectorAll('[data-dash]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.dash)));
  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    const user = account.value.trim() || (role === 'teacher' ? '演示教师' : '演示学生');
    loginCard.hidden = true;
    dashboard.hidden = false;
    dashUser.textContent = user;
    greeting.textContent = `你好，${user}`;
    roleLabel.textContent = role === 'teacher' ? 'TEACHER SPACE' : 'STUDENT SPACE';
    avatar.textContent = role === 'teacher' ? '师' : '学';
    switchView(role === 'teacher' ? 'teacher' : 'overview');
    showToast(`已进入${role === 'teacher' ? '教师' : '学生'}演示空间`);
  });
  document.getElementById('logout-button').addEventListener('click', () => {
    dashboard.hidden = true;
    loginCard.hidden = false;
  });
  const history = document.getElementById('submission-history');
  const renderHistory = () => {
    const entries = JSON.parse(localStorage.getItem('aio-course-v2-submissions') || '[]');
    history.innerHTML = entries.length ? entries.slice().reverse().map((item, index) =>
      `<div class="history-item"><strong>版本 v${entries.length - index}</strong><br>${new Date(item.time).toLocaleString('zh-CN')} · ${item.content.length} 字</div>`
    ).join('') : '<p class="form-help">还没有本地提交记录。</p>';
  };
  document.getElementById('submission-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = document.getElementById('assignment-content');
    const content = input.value.trim();
    if (!content) return;
    const entries = JSON.parse(localStorage.getItem('aio-course-v2-submissions') || '[]');
    entries.push({ content, time: new Date().toISOString() });
    localStorage.setItem('aio-course-v2-submissions', JSON.stringify(entries));
    renderHistory();
    showToast(`版本 v${entries.length} 已保存在当前浏览器`);
  });
  renderHistory();
}

const toast = document.getElementById('toast');
let toastTimer;
function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

const courseFilm = document.querySelector('.course-film');
if (courseFilm) {
  const video = document.getElementById('coursePromo');
  const playButton = document.getElementById('coursePromoPlay');

  // 滚到 15% 视口时触发入场动画（克制，单一主动效）
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          courseFilm.classList.add('is-visible');
          observer.disconnect();
        }
      });
    }, { threshold: 0.15 });
    observer.observe(courseFilm);
  } else {
    courseFilm.classList.add('is-visible');
  }

  // 点击播放：用户点击属于有效交互，浏览器允许带声播放
  if (playButton && video) {
    const start = () => {
      video.muted = false;
      video.controls = true;
      video.play().then(() => {
        playButton.classList.add('is-hidden');
        courseFilm.classList.add('is-playing');
      }).catch(() => {
        // 极小概率被拦截，仍显示原生控制条
        playButton.classList.add('is-hidden');
      });
    };
    playButton.addEventListener('click', start);

    video.addEventListener('ended', () => {
      video.controls = false;
      playButton.classList.remove('is-hidden');
      courseFilm.classList.remove('is-playing');
    });
    video.addEventListener('pause', () => {
      // 暂停时（未结束）保留控制条，不再显示大播放按钮
    });
  }
}

// ════════════════════════════════════════════════════════════════════
// 知识广场 · 项目课程平台
//
// 设计原则：
// 1. UI/交互 / 数据层解耦。状态 mutation 全部走 fetch，避免就地缓存；
//    这样 Stage 02 切到 PostgreSQL 时，前端一行不用改。
// 2. 卡片设计对齐 OpenMAIC 的 ClassroomCard：缩略图 + 元数据 + 互动。
// 3. 喜欢用早期 web 风格：单一主动效、克制动画、键盘可达。
// ════════════════════════════════════════════════════════════════════
(function plaza() {
  const grid = document.getElementById('plaza-grid');
  if (!grid) return;

  const tabLibrary = document.getElementById('tab-library');
  const tabProjects = document.getElementById('tab-projects');
  const panelLibrary = document.getElementById('panel-library');
  const panelProjects = document.getElementById('panel-projects');
  const isTabMode = !!(tabLibrary && tabProjects && panelLibrary && panelProjects);

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));

  // 在 tab 模式（如未拆分前的 knowledge.html）下才有 tab 切换逻辑
  if (isTabMode) {
    const switchTab = name => {
      const map = {
        library: { tab: tabLibrary, panel: panelLibrary },
        projects: { tab: tabProjects, panel: panelProjects },
      };
      Object.entries(map).forEach(([key, item]) => {
        const active = key === name;
        item.tab.classList.toggle('is-active', active);
        item.tab.setAttribute('aria-selected', String(active));
        item.panel.classList.toggle('is-hidden', !active);
      });
      if (name === 'projects' && !plazaState.loaded) loadPlaza();
    };
    tabLibrary.addEventListener('click', () => switchTab('library'));
    tabProjects.addEventListener('click', () => switchTab('projects'));
  }

  const plazaState = {
    projects: [],
    loaded: false,
    sort: 'recent',
    query: '',
  };

  const empty = document.getElementById('plaza-empty');
  const countLabel = document.getElementById('plaza-count');
  const search = document.getElementById('plaza-search');
  const sortSel = document.getElementById('plaza-sort');

  const sortProjects = projects => {
    const sorted = projects.slice();
    if (plazaState.sort === 'views') sorted.sort((a, b) => b.views - a.views);
    else if (plazaState.sort === 'likes') sorted.sort((a, b) => b.likes - a.likes);
    else sorted.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return sorted;
  };

  const filterProjects = projects => {
    const q = plazaState.query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
      (p.title || '').toLowerCase().includes(q) ||
      (p.subtitle || '').toLowerCase().includes(q) ||
      (p.tags || []).some(tag => (tag || '').toLowerCase().includes(q))
    );
  };

  const renderComments = comments => {
    if (!comments.length) {
      return '<div class="plaza-comment-empty">还没有评论。欢迎留下第一条观察。</div>';
    }
    return comments.map(c => `
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
  };

  const renderProject = project => {
    const cover = project.cover || '#1f5b57';
    const isImageCover = typeof cover === 'string' && (cover.startsWith('data:image') || cover.startsWith('/'));
    const coverStyle = isImageCover
      ? `background-image:url('${escapeHtml(cover)}');background-size:cover;background-position:center;`
      : `background:${escapeHtml(cover)};`;
    const coverTitle = isImageCover ? '' : `<div class="plaza-card-cover-title">${escapeHtml(project.title)}</div>`;
    return `
    <article class="plaza-card" data-project-id="${escapeHtml(project.id)}" data-viewer-href="viewer.html?id=${encodeURIComponent(project.id)}">
      <div class="plaza-card-cover" style="${coverStyle}">
        ${coverTitle}
        <div class="plaza-card-cover-mask">
          <span class="plaza-card-subtitle">${escapeHtml(project.subtitle || '')}</span>
        </div>
        <div class="plaza-card-tags">
          ${(project.tags || []).map(tag => `<span class="plaza-tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="plaza-card-body">
        <h3 class="plaza-card-title">${escapeHtml(project.title)}</h3>
        <div class="plaza-card-meta">
          <div class="plaza-owner">
            <span class="plaza-owner-avatar">${escapeHtml(project.owner?.avatar || '学')}</span>
            <span class="plaza-owner-name">${escapeHtml(project.owner?.name || '学习者')}</span>
            <span class="plaza-owner-role">${escapeHtml(project.owner?.role || '学习者')}</span>
          </div>
        </div>
        <div class="plaza-card-stats">
          <button type="button" class="plaza-like ${project.liked ? 'is-liked' : ''}" data-like-button aria-pressed="${project.liked}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="${project.liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-4.35-9.5-9.05C.85 8.1 3 4 6.6 4c1.95 0 3.4 1.05 4.2 2.55C11.6 5.05 13.05 4 15 4c3.6 0 5.75 4.1 4.1 7.95C19 16.65 12 21 12 21z"/></svg>
            <span data-like-count>${project.likes}</span>
          </button>
          <span class="plaza-views" title="播放量">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>
            <span data-views-count>${project.views}</span>
          </span>
          <button type="button" class="plaza-toggle-comments" data-toggle-comments>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span data-comment-count>${project.commentCount ?? (project.comments || []).length}</span> 评论
          </button>
        </div>
        <div class="plaza-card-comments" data-comments hidden>
          <div data-comments-list>${renderComments(project.comments || [])}</div>
          <form class="plaza-comment-form" data-comment-form>
            <textarea class="plaza-comment-input" data-comment-input rows="2" maxlength="600" placeholder="留下你的观察或问题（600 字以内）"></textarea>
            <div class="plaza-comment-actions">
              <span class="plaza-comment-hint" data-comment-hint>支持 Markdown 风格的引用、列表与重点词。</span>
              <button type="submit" class="button primary compact">发送评论</button>
            </div>
          </form>
        </div>
      </div>
    </article>`;
  };

  const findCard = projectId => grid.querySelector(`[data-project-id="${CSS.escape(projectId)}"]`);

  const renderGrid = () => {
    const visible = sortProjects(filterProjects(plazaState.projects));
    grid.innerHTML = visible.map(renderProject).join('');
    empty.style.display = visible.length ? 'none' : 'block';
    countLabel.textContent = `${plazaState.projects.length} 个项目 · ${visible.length} 个匹配筛选`;
  };

  async function loadPlaza() {
    grid.innerHTML = '<div class="plaza-loading">正在加载项目课程…</div>';
    try {
      const response = await fetch('/api/plaza/projects');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      plazaState.projects = data.items || [];
      plazaState.loaded = true;
      renderGrid();
    } catch (error) {
      grid.innerHTML = '<div class="notice">项目课程暂时无法加载。课程服务会自动恢复，请稍后刷新。</div>';
      countLabel.textContent = '连接中断';
    }
  }

  search?.addEventListener('input', () => {
    plazaState.query = search.value;
    renderGrid();
  });
  sortSel?.addEventListener('change', () => {
    plazaState.sort = sortSel.value;
    renderGrid();
  });

  // 点赞 —— 单卡单按钮，立刻给反馈，再异步校验
  grid.addEventListener('click', async event => {
    const likeButton = event.target.closest('[data-like-button]');
    if (!likeButton) return;
    event.stopPropagation(); // 阻止卡片整体跳转到 viewer.html
    const card = likeButton.closest('[data-project-id]');
    if (!card) return;
    const projectId = card.dataset.projectId;
    const project = plazaState.projects.find(p => p.id === projectId);
    if (!project) return;
    // Optimistic UI: 反转 liked + likes
    const next = !project.liked;
    const delta = next ? 1 : -1;
    project.liked = next;
    project.likes = Math.max(0, project.likes + delta);
    likeButton.classList.toggle('is-liked', project.liked);
    likeButton.setAttribute('aria-pressed', String(project.liked));
    likeButton.querySelector('svg').setAttribute('fill', project.liked ? 'currentColor' : 'none');
    likeButton.querySelector('[data-like-count]').textContent = project.likes;
    try {
      const response = await fetch('/api/plaza/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action: next ? 'on' : 'off' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '请求失败');
      project.liked = !!data.liked;
      project.likes = Number(data.likes) || project.likes;
      likeButton.classList.toggle('is-liked', project.liked);
      likeButton.querySelector('[data-like-count]').textContent = project.likes;
    } catch (error) {
      // 回滚
      project.liked = !next;
      project.likes = Math.max(0, project.likes - delta);
      likeButton.classList.toggle('is-liked', project.liked);
      likeButton.querySelector('[data-like-count]').textContent = project.likes;
      showToast(error.message || '点赞请求未成功');
    }
  });

  // 评论展开/收起
  grid.addEventListener('click', event => {
    const toggle = event.target.closest('[data-toggle-comments]');
    if (!toggle) return;
    event.stopPropagation();
    const card = toggle.closest('[data-project-id]');
    if (!card) return;
    const comments = card.querySelector('[data-comments]');
    comments.hidden = !comments.hidden;
    if (!comments.hidden) {
      const input = comments.querySelector('[data-comment-input]');
      if (input) requestAnimationFrame(() => input.focus());
    }
  });

  // 评论提交
  grid.addEventListener('submit', async event => {
    const form = event.target.closest('[data-comment-form]');
    if (!form) return;
    event.stopPropagation();
    event.preventDefault();
    const card = form.closest('[data-project-id]');
    const input = form.querySelector('[data-comment-input]');
    const hint = form.querySelector('[data-comment-hint]');
    const text = (input.value || '').trim();
    if (!text) {
      hint.textContent = '请先写下你的观察。';
      return;
    }
    const projectId = card.dataset.projectId;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
      const response = await fetch('/api/plaza/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, text, author: '我' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '提交失败');
      const project = plazaState.projects.find(p => p.id === projectId);
      project.comments = project.comments || [];
      project.comments.push(data.comment);
      project.commentCount = data.commentCount;
      form.closest('[data-comments]').querySelector('[data-comments-list]').innerHTML = renderComments(project.comments);
      card.querySelector('[data-comment-count]').textContent = data.commentCount;
      input.value = '';
      hint.textContent = '已发送，欢迎继续交流。';
      showToast('评论已发布');
    } catch (error) {
      hint.textContent = error.message || '暂时无法发送，请稍后再试。';
    } finally {
      submitButton.disabled = false;
    }
  });

  // 导入按钮 —— 跳转到教学平台 (teaching.html 嵌入了 OpenMAIC iframe)
  document.getElementById('plaza-import')?.addEventListener('click', async () => {
    try {
      const response = await fetch('/api/plaza/import', { method: 'GET' });
      const data = await response.json();
      if (data.openUrl) {
        window.location.href = data.openUrl;
      }
    } catch (error) {
      window.location.href = '/teaching.html';
    }
  });

  // 卡片整体可点击 → viewer.html（点赞/评论按钮自行 stopPropagation）
  grid.addEventListener('click', event => {
    const card = event.target.closest('[data-viewer-href]');
    if (!card) return;
    // 点赞/评论按钮已 stopPropagation，到达这里说明点击的是卡片本身
    const href = card.getAttribute('data-viewer-href');
    if (href) window.location.href = href;
  });

  // 独立页（projects.html）直接加载；tab 模式等用户切到 projects 时再加载
  if (!isTabMode) loadPlaza();
})();
