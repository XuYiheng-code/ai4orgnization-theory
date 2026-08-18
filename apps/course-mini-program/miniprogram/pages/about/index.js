Page({
  data: {},

  onLoad() {
    // 非 tab 页，无需设置 tabBar 高亮
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      // 关于页不在 tabBar，取消高亮即可
      this.getTabBar().setData({ selected: -1 });
    }
  },

  openOfficial() {
    wx.setClipboardData({
      data: 'https://public.nju.edu.cn/szdw/qzjs/azy/20230323/i240671.html',
      success() {
        wx.showToast({ title: '官网链接已复制', icon: 'none' });
      }
    });
  }
});
