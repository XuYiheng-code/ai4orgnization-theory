const auth = require('../../services/auth');
const config = require('../../config/index');
const privacy = require('../../utils/privacy');

const TAB_PAGES = [
  '/pages/home/index', '/pages/syllabus/index', '/pages/textbooks/index',
  '/pages/knowledge/index', '/pages/ask/index', '/pages/profile/index'
];

const DEFAULT_FORMS = () => ({
  login:    { account: '', password: '' },
  register: { accountType: 'student', studentId: '', name: '', email: '', phone: '', password: '' },
  reset:    { account: '', oldPassword: '', newPassword: '' }
});

Page({
  data: {
    next: '/pages/profile/index',
    mode: 'login', // 'login' | 'register' | 'reset'
    form: DEFAULT_FORMS(),
    loading: { login: false, register: false, reset: false },
    feedback: { text: '', kind: '' },
    showPrivacy: false
  },

  onLoad(options) {
    if (options.next) this.setData({ next: decodeURIComponent(options.next) });
    if (options.mode === 'register') this.setData({ mode: 'register' });
    else if (options.mode === 'reset') this.setData({ mode: 'reset' });
  },

  onShow() {
    // 如果本地已登录（其他来源），无需再输入
    const user = auth.getCurrentUser();
    if (user) {
      this._redirectNext(`欢迎回来，${user.name}`);
    }
  },

  switchMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.mode) return;
    this.setData({ mode, feedback: { text: '', kind: '' } });
  },

  pickRole(e) {
    const role = e.currentTarget.dataset.role;
    this.setData({ 'form.register.accountType': role });
  },

  onInput(e) {
    const { form, name } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({ [`form.${form}.${name}`]: value });
  },

  openPrivacy() {
    privacy.openPrivacyPage();
  },

  onPrivacyAgreed() {
    this.setData({ showPrivacy: false });
    privacy.markAgreed();
  },

  onPrivacyCancel() {
    this.setData({ showPrivacy: false });
  },

  async submit(e) {
    const which = e.currentTarget.dataset.form;
    if (this.data.loading[which]) return;
    if (!privacy.hasAgreed()) {
      this.setData({ showPrivacy: true });
      return;
    }
    this.proceedSubmit(which);
  },

  async proceedSubmit(which) {
    const form = this.data.form[which];
    this.setData({ [`loading.${which}`]: true, feedback: { text: '', kind: '' } });
    try {
      let data;
      if (which === 'login') {
        this._validateLogin(form);
        data = await auth.login({ account: form.account.trim(), password: form.password });
        this._redirectNext(`欢迎回来，${data.user.name}`);
      } else if (which === 'register') {
        this._validateRegister(form);
        data = await auth.register({
          accountType: form.accountType,
          account: form.email.trim() || form.phone.trim(),
          password: form.password,
          name: form.name.trim(),
          studentId: form.accountType === 'student' ? form.studentId.trim() : undefined
        });
        this._redirectNext(`注册成功，欢迎 ${data.user.name}`);
      } else if (which === 'reset') {
        this._validateReset(form);
        data = await auth.resetPassword({
          account: form.account.trim(),
          oldPassword: form.oldPassword,
          newPassword: form.newPassword
        });
        // 重置后留在当前页，提示切回登录
        this.setData({
          feedback: { text: `密码已重置，请用新密码重新登录。`, kind: 'is-success' },
          form: DEFAULT_FORMS(),
          mode: 'login'
        });
        wx.showToast({ title: '密码已重置', icon: 'success' });
      }
    } catch (err) {
      this.setData({ feedback: { text: err.message || '请求失败', kind: 'is-error' } });
    } finally {
      this.setData({ [`loading.${which}`]: false });
    }
  },

  _validateLogin(form) {
    if (!form.account || !form.account.trim()) throw new Error('请填写邮箱或手机号。');
    if (!form.password) throw new Error('请填写密码。');
  },

  _validateRegister(form) {
    if (!form.name || !form.name.trim()) throw new Error('请填写姓名或昵称。');
    const account = (form.email || '').trim() || (form.phone || '').trim();
    if (!account) throw new Error('请填写邮箱或手机号至少一个。');
    if (form.accountType === 'student' && !form.studentId.trim()) throw new Error('课程学生需要填写学号。');
    if (!form.password || form.password.length < 8) throw new Error('密码至少 8 位。');
  },

  _validateReset(form) {
    if (!form.account || !form.account.trim()) throw new Error('请填写邮箱或手机号。');
    if (!form.oldPassword) throw new Error('请填写原密码。');
    if (!form.newPassword || form.newPassword.length < 8) throw new Error('新密码至少 8 位。');
  },

  _redirectNext(message) {
    wx.showToast({ title: message || '登录成功', icon: 'success' });
    setTimeout(() => {
      if (TAB_PAGES.includes(this.data.next)) {
        wx.switchTab({ url: this.data.next });
      } else {
        wx.redirectTo({ url: this.data.next });
      }
    }, 350);
  }
});
