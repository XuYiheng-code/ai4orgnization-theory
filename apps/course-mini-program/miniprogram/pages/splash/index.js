const STORAGE_KEY = 'splash_logo_shown_v1';
const INTRO_FALLBACK_MS = 2000;
const FALLBACK_MS = 5200;

Page({
  data: {
    showVideo: true,
    showFallback: false,
    videoSrc: 'https://www.ai4orgnization-theory.cn/assets/splash-intro.mp4',
    courseName: '人工智能与组织管理',
    orgName: '南京大学政府管理学院'
  },

  onLoad() {
    const alreadyShown = !!wx.getStorageSync(STORAGE_KEY);
    if (alreadyShown) {
      this.goHome();
      return;
    }
    // 兜底：若视频因任何原因 5.2s 还没结束，自动跳转
    this.fallbackTimer = setTimeout(() => {
      if (!this.ended) this.goHome();
    }, FALLBACK_MS);
    // 1.2s 内若视频未开始播放（首帧仍未就绪），用本地静态兜底避免白屏
    this.startFallbackTimer = setTimeout(() => {
      if (!this.ended && !this.videoReady) this.activateFallback();
    }, INTRO_FALLBACK_MS);
  },

  onVideoPlay() {
    this.videoReady = true;
  },

  onEnded() {
    this.ended = true;
    this.goHome();
  },

  onError() {
    if (this.ended) return;
    this.ended = true;
    this.activateFallback();
  },

  activateFallback() {
    this.setData({ showVideo: false, showFallback: true });
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    // fallback 出现 1.4s 后再跳
    if (this.fallbackEndTimer) clearTimeout(this.fallbackEndTimer);
    this.fallbackEndTimer = setTimeout(() => this.goHome(), 1400);
  },

  skipSplash() {
    if (this.ended) return;
    this.ended = true;
    this.goHome();
  },

  goHome() {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.fallbackEndTimer) {
      clearTimeout(this.fallbackEndTimer);
      this.fallbackEndTimer = null;
    }
    if (this.startFallbackTimer) {
      clearTimeout(this.startFallbackTimer);
      this.startFallbackTimer = null;
    }
    try { wx.setStorageSync(STORAGE_KEY, true); } catch (e) {}
    wx.switchTab({ url: '/pages/home/index' });
  },

  onUnload() {
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    if (this.fallbackEndTimer) clearTimeout(this.fallbackEndTimer);
    if (this.startFallbackTimer) clearTimeout(this.startFallbackTimer);
  }
});
