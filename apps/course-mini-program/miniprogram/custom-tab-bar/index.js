Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/home/index', text: '首页', icon: 'home' },
      { pagePath: '/pages/syllabus/index', text: '大纲', icon: 'outline' },
      { pagePath: '/pages/textbooks/index', text: '教材', icon: 'book' },
      { pagePath: '/pages/knowledge/index', text: '知识', icon: 'plaza' },
      { pagePath: '/pages/ask/index', text: '问答', icon: 'ask' },
      { pagePath: '/pages/profile/index', text: '我的', icon: 'person' }
    ]
  },
  methods: {
    switchTab(event) {
      const index = event.currentTarget.dataset.index;
      const url = this.data.list[index].pagePath;
      wx.switchTab({ url });
      this.setData({ selected: index });
    }
  }
});
