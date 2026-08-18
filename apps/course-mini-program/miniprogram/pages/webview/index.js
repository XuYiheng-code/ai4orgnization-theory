Page({
  data: {
    src: '',
    title: '课程平台'
  },

  onLoad(options) {
    const src = options.src ? decodeURIComponent(options.src) : '';
    const title = options.title ? decodeURIComponent(options.title) : '课程平台';
    this.setData({ src, title });
    if (title) wx.setNavigationBarTitle({ title });
  }
});
