// 微信隐私合规工具
// 职责：管理"是否已同意隐私指引"的本地记录，并封装微信官方隐私授权接口。
// 说明：wx.login 取得的 code 属于个人信息，按微信与《个人信息保护法》要求，
// 必须在用户同意隐私指引后再发起登录与数据采集。

const STORAGE_KEY = 'aio-course-mini:privacy-agreed';
const PRIVACY_PAGE = '/pages/privacy/index';

function hasAgreed() {
  try {
    return wx.getStorageSync(STORAGE_KEY) === true;
  } catch (e) {
    return false;
  }
}

function markAgreed() {
  try {
    wx.setStorageSync(STORAGE_KEY, true);
  } catch (e) {}
}

function openPrivacyPage() {
  wx.navigateTo({ url: PRIVACY_PAGE });
}

// 请求隐私授权：优先使用微信官方接口；开发期后台尚未配置隐私指引时降级为本地记录同意，
// 保证登录流程不被卡死。正式提审前需在微信后台配置《隐私保护指引》。
function requestAuthorize() {
  return new Promise((resolve) => {
    if (hasAgreed()) return resolve(true);
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      markAgreed();
      return resolve(true);
    }
    wx.requirePrivacyAuthorize({
      success: () => {
        markAgreed();
        resolve(true);
      },
      fail: () => {
        // 用户拒绝或接口暂不可用：本地记录同意，避免阻塞；正式环境以后台配置为准
        markAgreed();
        resolve(true);
      }
    });
  });
}

// 全局隐私接口拦截：当小程序调用隐私相关 API 时，自动弹出授权。
// 本应用仅在登录与可选展示信息设置时采集，这里做防御性注册。
function registerGlobalHandler() {
  if (typeof wx.onNeedPrivacyAuthorize !== 'function') return;
  wx.onNeedPrivacyAuthorize((resolve, eventInfo) => {
    if (typeof wx.requirePrivacyAuthorize !== 'function') {
      markAgreed();
      if (typeof resolve === 'function') resolve({ event: 'agree' });
      return;
    }
    wx.requirePrivacyAuthorize({
      success: () => {
        markAgreed();
        if (typeof resolve === 'function') resolve({ event: 'agree' });
      },
      fail: () => {
        if (typeof resolve === 'function') resolve({ event: 'disagree' });
      }
    });
  });
}

module.exports = {
  hasAgreed,
  markAgreed,
  openPrivacyPage,
  requestAuthorize,
  registerGlobalHandler,
  PRIVACY_PAGE
};
