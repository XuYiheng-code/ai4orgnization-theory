const course = require('../../services/course.js');

Page({
  data: {
    // 默认值：接口未就绪时（如弱网）也能渲染，避免空白。
    hero: {
      eyebrow: '16 周主题内容 · 组织理论 × 人工智能',
      titleLead: '人工智能与',
      titleAccent: '组织管理',
      lead: '从经典组织理论出发，理解算法管理、大语言模型和智能体如何进入组织的分工、决策、权力与责任，并把这些变化放回公共管理的现实情境中讨论。',
      team: [
        { label: '内容作者：', name: '于君博' },
        { label: '内容协作：', name: '徐亦恒' }
      ]
    },
    filmChapters: [
      { no: '01', label: '内容命题', desc: '组织理论 × 人工智能为何相遇' },
      { no: '02', label: '16 周路径', desc: '四个阶段，从解释组织到约束算法' },
      { no: '03', label: '每周 90 分钟', desc: '30 分钟讲授 + 60 分钟学术讨论' },
      { no: '04', label: '真实平台', desc: '在教学平台上动手做，做完可发布' }
    ],
    phases: [
      { no: '01', weeks: 'WEEK 01—04', stage: 1, title: '组织理论：解释组织', desc: '用官僚制、有限理性、信息处理与资源依赖回答“组织为何如此运作”。' },
      { no: '02', weeks: 'WEEK 05—08', stage: 2, title: '技术嵌入：重塑结构与协作', desc: '考察算法管理和人机协作如何改变控制、团队、领导与变革。' },
      { no: '03', weeks: 'WEEK 09—12', stage: 3, title: '智能行动者：重构决策与权力', desc: '讨论 AI 进入判断和行动之后，裁量、价值与制度关系怎样变化。' },
      { no: '04', weeks: 'WEEK 13—16', stage: 4, title: '公共治理：约束算法与责任', desc: '把公平、程序、司法审查与监管转化为可执行的公共责任框架。' }
    ],
    entries: [
      { no: '01 / SYLLABUS', title: '内容大纲', desc: '四个阶段、16 周主题、内容安排与学习反馈方式。' },
      { no: '02 / MATERIALS', title: '学习资料', desc: '主资料、人工智能基础素养与 AI 实操指南。' }
    ]
  },

  onLoad() {
    this.refreshCourseContent();
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 0 });
  },

  // 从后端单一数据源拉取课程内容；成功则覆盖本地默认值。
  refreshCourseContent() {
    course.getCourseOverview()
      .then((data) => {
        const patch = {};
        if (data.hero) patch.hero = data.hero;
        if (Array.isArray(data.filmChapters)) patch.filmChapters = data.filmChapters;
        if (Array.isArray(data.phases)) patch.phases = data.phases;
        if (Array.isArray(data.entries)) patch.entries = data.entries;
        if (Object.keys(patch).length) this.setData(patch);
      })
      .catch((err) => {
        // 弱网/接口不可用时保留默认值，不阻断页面。
        console.warn('[home] 课程内容简介加载失败，使用本地兜底：', err);
      });
  },

  goSyllabus() {
    wx.switchTab({ url: '/pages/syllabus/index' });
  },

  goTextbooks() {
    wx.switchTab({ url: '/pages/textbooks/index' });
  },

  goAbout() {
    wx.navigateTo({ url: '/pages/about/index' });
  },

  goAsk() {
    wx.switchTab({ url: '/pages/ask/index' });
  },

  scrollToFilm() {
    wx.pageScrollTo({ selector: '#film-section', duration: 320 });
  },

});
