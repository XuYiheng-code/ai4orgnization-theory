const auth = require('../../services/auth');
const privacy = require('../../utils/privacy');

function maskAccount(account, type) {
  if (!account) return '—';
  if (type === 'email' && account.includes('@')) {
    const [u, d] = account.split('@');
    const head = u.slice(0, Math.min(2, u.length));
    return `${head}${'*'.repeat(Math.max(2, u.length - 2))}@${d}`;
  }
  if (type === 'phone' || /^\+?\d/.test(account)) {
    return account.length <= 7 ? account : `${account.slice(0, 3)}****${account.slice(-4)}`;
  }
  // 邮箱
  if (account.includes('@')) return maskAccount(account, 'email');
  return account.length > 6 ? `${account.slice(0, 2)}***${account.slice(-2)}` : account;
}

function pickAccountInfo(user) {
  if (!user) return { text: '—', kind: '' };
  if (user.email) return { text: user.email, kind: 'email' };
  if (user.phone) return { text: user.phone, kind: 'phone' };
  if (user.account) return { text: user.account, kind: '' };
  return { text: '—', kind: '' };
}

function sessionExpireText() {
  const session = auth.getSession();
  if (!session || !session.token || session.mock) return '本地会话';
  // 后端 30 天，到期可重新登录续期
  return '30 天内有效';
}

Page({
  data: {
    user: null,
    avatarInitial: '',
    maskedAccount: '—',
    sessionExpireText: '本地会话'
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 5 });
    // 同步本地登录态
    let user = auth.getCurrentUser();
    this._renderUser(user);
    // 异步从后端拿一次最新 user（cookie 自动带）
    auth.fetchMe().then(latest => {
      if (latest) this._renderUser(latest);
    });
  },

  _renderUser(user) {
    const acct = pickAccountInfo(user);
    this.setData({
      user,
      avatarInitial: user && user.name ? user.name.slice(0, 1) : '',
      maskedAccount: maskAccount(acct.text, acct.kind),
      sessionExpireText: sessionExpireText()
    });
  },

  openLogin() {
    wx.navigateTo({ url: '/pages/login/index?next=' + encodeURIComponent('/pages/profile/index') });
  },

  openAbout() {
    wx.navigateTo({ url: '/pages/about/index' });
  },

  openPrivacy() {
    privacy.openPrivacyPage();
  },

  openAsk() {
    wx.switchTab({ url: '/pages/ask/index' });
  },

  onLogout() {
    const user = auth.getCurrentUser();
    const name = user ? user.name : '';
    wx.showModal({
      title: '退出登录',
      content: name ? `确认要退出 ${name} 吗？退出后会清除本地会话，需重新登录。` : '确认要退出登录吗？',
      confirmText: '退出',
      cancelText: '取消',
      confirmColor: '#c0392b',
      success: async (res) => {
        if (!res.confirm) return;
        await auth.logout();
        this.setData({
          user: null, avatarInitial: '', maskedAccount: '—'
        });
        wx.showToast({ title: '已退出', icon: 'success' });
      }
    });
  }
});
