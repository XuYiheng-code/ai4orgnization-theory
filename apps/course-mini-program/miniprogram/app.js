const config = require('./config/index');
const auth = require('./services/auth');
const privacy = require('./utils/privacy');

App({
  globalData: {
    config,
    session: null,
    system: null
  },

  onLaunch() {
    this.globalData.system = wx.getSystemInfoSync();
    this.globalData.session = auth.getSession();
    // 注册微信隐私接口全局拦截，符合《个人信息保护法》与微信平台要求
    privacy.registerGlobalHandler();
  }
});
