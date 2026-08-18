const config = require('../config/index');
const storage = require('../utils/storage');

const SESSION_KEY = `${config.storagePrefix}:session`;

// 通用：wx.request Promise 封装。wx.request 自 2.10.4 起内置 cookie jar
// （同域 Set-Cookie 自动保存、跨请求自动带 Cookie 头），所以 aio_session
// 在 /api/auth/* 注册/登录/重置后会被复用，与官网共享同一份会话。
function requestJson({ url, method = 'GET', data = null, header = null, timeout = config.requestTimeout || 30000 }) {
  return new Promise((resolve, reject) => {
    const options = {
      url,
      method,
      timeout,
      data: data || {},
      success(response) {
        const status = response.statusCode;
        if (status >= 200 && status < 300) {
          resolve(response.data || {});
        } else {
          const message = (response.data && (response.data.error || response.data.message)) || `请求失败 (${status})`;
          reject(Object.assign(new Error(message), { status, data: response.data }));
        }
      },
      fail(err) {
        reject(Object.assign(new Error(err.errMsg || '网络异常，请检查网络设置。'), { network: true }));
      }
    };
    if (header) options.header = header;
    if (method !== 'GET' && data) {
      options.header = Object.assign({ 'Content-Type': 'application/json' }, options.header || {});
    }
    wx.request(options);
  });
}

function getSession() {
  try {
    return wx.getStorageSync(SESSION_KEY) || null;
  } catch (error) {
    return null;
  }
}

function saveSession(session) {
  if (!session) return null;
  // 同时保存到 storage（持久化）与 globalData（运行时），刷新可恢复
  wx.setStorageSync(SESSION_KEY, session);
  getApp().globalData.session = session;
  return session;
}

function clearSession() {
  try { wx.removeStorageSync(SESSION_KEY); } catch (e) {}
  if (getApp() && getApp().globalData) getApp().globalData.session = null;
}

function getCurrentUser() {
  const session = getSession();
  return session ? session.user : null;
}

function requireLogin(next) {
  const user = getCurrentUser();
  if (user) return user;
  const encoded = encodeURIComponent(next || '/pages/profile/index');
  wx.navigateTo({ url: `/pages/login/index?next=${encoded}` });
  return null;
}

// mock 模式：用于本地开发者工具调试（未配真实后端时）
function mockLogin(role, name) {
  const user = {
    id: role === 'teacher' ? 'demo-teacher-001' : 'demo-student-001',
    name: name || (role === 'teacher' ? '演示教师' : '演示学生'),
    role,
    accountType: role === 'teacher' ? 'student' : 'guest',
    classId: 'class-2026-a',
    className: '2026 秋季试用班'
  };
  return saveSession({ token: 'mock-token', user, mock: true });
}

// 真实：微信 code 登录（保留兼容）
function loginWithWeChat() {
  if (config.mockMode) return Promise.resolve(mockLogin('student'));
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (!result.code) return reject(new Error('没有取得微信登录凭证。'));
        requestJson({ url: `${config.apiBaseUrl}/v1/auth/wechat/login`, method: 'POST', data: { code: result.code } })
          .then(data => resolve(saveSession(data)))
          .catch(reject);
      },
      fail: reject
    });
  });
}

// 真实：账号密码注册（对标官网 /api/auth/register）
function register({ accountType, account, password, name, studentId } = {}) {
  if (config.mockMode) return Promise.resolve(mockLogin(accountType === 'student' ? 'student' : 'guest', name));
  return requestJson({
    url: `${config.apiBaseUrl}/api/auth/register`,
    method: 'POST',
    data: { accountType, account, password, name, studentId: accountType === 'student' ? studentId : undefined }
  }).then(data => saveSession(data));
}

// 真实：账号密码登录（对标官网 /api/auth/login）
function login({ account, password } = {}) {
  if (config.mockMode) return Promise.resolve(mockLogin('student', '演示学生'));
  return requestJson({
    url: `${config.apiBaseUrl}/api/auth/login`,
    method: 'POST',
    data: { account, password }
  }).then(data => saveSession(data));
}

// 真实：重置密码（对标官网 /api/auth/reset-password）
function resetPassword({ account, oldPassword, newPassword } = {}) {
  if (config.mockMode) return Promise.reject(new Error('演示模式不支持重置密码，请配置真实后端。'));
  return requestJson({
    url: `${config.apiBaseUrl}/api/auth/reset-password`,
    method: 'POST',
    data: { account, oldPassword, newPassword }
  }).then(data => saveSession(data));
}

// 真实：注销（清服务端 session + 本地）
function logout() {
  if (config.mockMode) { clearSession(); return Promise.resolve({ ok: true }); }
  return requestJson({ url: `${config.apiBaseUrl}/api/auth/logout`, method: 'POST' })
    .catch(() => ({}))
    .then(() => { clearSession(); return { ok: true }; });
}

// 真实：拉取当前用户（用于 onShow 续期/退出态校验）
function fetchMe() {
  if (config.mockMode) return Promise.resolve(getCurrentUser());
  return requestJson({ url: `${config.apiBaseUrl}/api/auth/me`, method: 'GET' })
    .then(data => {
      if (data && data.user) {
        // 同步刷新本地用户信息
        const session = getSession();
        if (session) saveSession(Object.assign({}, session, { user: data.user }));
        return data.user;
      }
      // 401 等场景：cookie 失效 → 清本地
      clearSession();
      return null;
    })
    .catch(err => {
      if (err && (err.status === 401 || err.status === 403)) clearSession();
      return null;
    });
}

function clearUserDrafts(userId) {
  storage.remove('assignment-drafts', userId);
}

function updateUser(patch) {
  const session = getSession();
  if (!session) return null;
  const updated = Object.assign({}, session, { user: Object.assign({}, session.user, patch) });
  return saveSession(updated);
}

module.exports = {
  // session 本地管理
  getSession,
  saveSession,
  clearSession,
  getCurrentUser,
  requireLogin,
  fetchMe,
  // 登录方式
  loginWithWeChat,
  register,
  login,
  resetPassword,
  logout,
  // mock（开发用）
  mockLogin,
  // 辅助
  clearUserDrafts,
  updateUser,
  // 内部
  requestJson
};
