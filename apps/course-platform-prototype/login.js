// login.js — 注册 / 登录 / 重置密码三合一页面
(function loginPage() {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const tabReset = document.getElementById('tab-reset');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const formReset = document.getElementById('form-reset');
  if (!tabLogin || !formLogin) return;

  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(msg, isError) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.toggle('is-error', !!isError);
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
  }
  function setFeedback(form, text, isError) {
    const el = form.querySelector('.login-feedback');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', !!isError);
    el.classList.toggle('is-success', !isError && !!text);
  }

  const tabs = [
    { tab: tabLogin, form: formLogin, mode: 'login' },
    { tab: tabRegister, form: formRegister, mode: 'register' },
    { tab: tabReset, form: formReset, mode: 'reset' },
  ];

  function switchMode(mode) {
    tabs.forEach(({ tab, form, mode: m }) => {
      const active = m === mode;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      form.classList.toggle('is-active', active);
    });
    // 切换时清空所有反馈
    tabs.forEach(({ form }) => setFeedback(form, '', false));
  }

  tabs.forEach(({ tab, mode }) => tab.addEventListener('click', () => switchMode(mode)));
  document.querySelectorAll('[data-switch]').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.switch));
  });

  // 身份切换：课程学生需学号
  const studentIdField = document.getElementById('field-studentId');
  const studentIdInput = studentIdField?.querySelector('input[name="studentId"]');
  function syncStudentIdRequired() {
    const role = formRegister.querySelector('input[name="accountType"]:checked')?.value;
    if (role === 'student') {
      studentIdField.classList.remove('is-hidden');
      if (studentIdInput) studentIdInput.required = true;
    } else {
      studentIdField.classList.add('is-hidden');
      if (studentIdInput) {
        studentIdInput.required = false;
        studentIdInput.value = '';
      }
    }
  }
  formRegister.querySelectorAll('input[name="accountType"]').forEach(r =>
    r.addEventListener('change', syncStudentIdRequired),
  );
  syncStudentIdRequired();

  // 通用 submit helper
  async function submitForm(form, path, payload) {
    setFeedback(form, '', false);
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
      return data;
    } catch (err) {
      setFeedback(form, err.message || '网络错误', true);
      throw err;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  function onSuccess(form, message) {
    setFeedback(form, message, false);
    showToast(message);
  }

  function redirectAfterAuth() {
    // URL ?next=... 优先；否则回 projects.html
    const params = new URLSearchParams(location.search);
    const next = params.get('next') || '/projects.html';
    setTimeout(() => { location.href = next; }, 600);
  }

  // 登录
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(formLogin);
    const account = (fd.get('account') || '').toString().trim();
    const password = (fd.get('password') || '').toString();
    if (!account || !password) {
      setFeedback(formLogin, '请填写账号和密码。', true);
      return;
    }
    try {
      const data = await submitForm(formLogin, '/api/auth/login', { account, password });
      onSuccess(formLogin, `欢迎回来，${data.user.name}`);
      redirectAfterAuth();
    } catch {}
  });

  // 注册
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(formRegister);
    const accountType = (fd.get('accountType') || '').toString();
    const name = (fd.get('name') || '').toString().trim();
    const email = (fd.get('email') || '').toString().trim();
    const phone = (fd.get('phone') || '').toString().trim().replace(/[\s-]/g, '');
    const password = (fd.get('password') || '').toString();
    const studentId = (fd.get('studentId') || '').toString().trim();
    const account = email || phone;
    if (!name) { setFeedback(formRegister, '请填写姓名或昵称。', true); return; }
    if (!email && !phone) { setFeedback(formRegister, '请填写邮箱或手机号至少一个。', true); return; }
    if (accountType === 'student' && !studentId) {
      setFeedback(formRegister, '课程学生需要填写学号。', true);
      return;
    }
    try {
      const data = await submitForm(formRegister, '/api/auth/register', {
        accountType, account, name, password,
        studentId: accountType === 'student' ? studentId : undefined,
      });
      onSuccess(formRegister, `注册成功，欢迎 ${data.user.name}`);
      redirectAfterAuth();
    } catch {}
  });

  // 重置密码
  formReset.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(formReset);
    const account = (fd.get('account') || '').toString().trim();
    const oldPassword = (fd.get('oldPassword') || '').toString();
    const newPassword = (fd.get('newPassword') || '').toString();
    if (!account || !oldPassword || !newPassword) {
      setFeedback(formReset, '请填写完整信息。', true);
      return;
    }
    try {
      const data = await submitForm(formReset, '/api/auth/reset-password', {
        account, oldPassword, newPassword,
      });
      onSuccess(formReset, `密码已重置，欢迎 ${data.user.name}`);
      setTimeout(() => switchMode('login'), 800);
    } catch {}
  });

  // 如果 URL 带 ?mode=... 直接切换
  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'register') switchMode('register');
  else if (params.get('mode') === 'reset') switchMode('reset');
})();
