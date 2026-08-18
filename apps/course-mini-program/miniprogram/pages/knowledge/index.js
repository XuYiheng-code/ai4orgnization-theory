Page({
  data: {
    gates: [
      {
        id: 'refs',
        cover: 'navy',
        kicker: 'Course References',
        title: '课程参考文献',
        desc: '教师团队上新，提供在线阅读、原文件下载与深度梳理。点击「文献梳理」会跳转到包含文字版与动画版的导读。',
        points: ['教师团队持续上新与完善', '在线阅读 · 原文下载 · AI 问答', '深度梳理：文字版 + 动画版'],
        cta: '进入课程参考文献 →',
        url: 'https://www.ai4orgnization-theory.cn/references.html'
      },
      {
        id: 'projects',
        cover: 'orange',
        kicker: 'Course Projects',
        title: '项目课程平台',
        desc: '同学们在教学平台生成课程后，可以发布到这个广场。彼此看到、点赞、评论，把课堂学习变成一次共同讨论。',
        points: ['类似 OpenMAIC 发现页的卡片', '作者 · 点赞数 · 播放量 · 评论', '一键从教学平台导入'],
        cta: '进入项目课程平台 →',
        url: 'https://www.ai4orgnization-theory.cn/projects.html'
      }
    ]
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 3 });
  },

  openGate(event) {
    const url = encodeURIComponent(event.currentTarget.dataset.url);
    const title = encodeURIComponent(event.currentTarget.dataset.title);
    wx.navigateTo({ url: `/pages/webview/index?src=${url}&title=${title}` });
  }
});
