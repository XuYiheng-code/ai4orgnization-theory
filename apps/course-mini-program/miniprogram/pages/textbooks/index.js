const course = require('../../services/course.js');

Page({
  data: {
    books: [
      { letter: 'A', title: '人工智能与公共组织', desc: '主资料。内容对应 16 周主题，从组织理论、技术与协作进入算法裁量、公共价值、制度与监管。', pill: '逐章建设', status: '下一步：选择样板单元，完成两节可公开阅读的样章。' },
      { letter: 'B', title: '人工智能基础素养', desc: '解释生成式 AI、大语言模型、知识库与智能体的基本原理，也帮助学习者识别幻觉、偏见和数据风险。', pill: '已有内容基础', status: '来源：AI 素养培训项目中的 D1—D5 能力框架。' },
      { letter: 'C', title: 'AI 实操指南', desc: '围绕结构化指令、文档处理、知识检索、Skill、数据分析与安全使用，组织成可直接练习的短章节。', pill: '待选编', status: '下一步：整理现有教程，确认版权与课程适用范围。' }
    ],
    chapters: [
      { tag: 'PART I', title: '组织为何存在', desc: '官僚制、有限理性、信息处理与资源依赖。' },
      { tag: 'PART II', title: '技术如何进入组织', desc: '算法管理、团队协作、领导力与组织变革。' },
      { tag: 'PART III', title: '智能体成为行动者', desc: '裁量权、公共价值、制度张力与平台政府。' },
      { tag: 'PART IV', title: '公共责任如何安放', desc: '算法公平、正当程序、司法审查与监管。' },
      { tag: 'METHOD', title: '人机协同学习', desc: '提示词、角色模拟、算法审计与批判性核查。' },
      { tag: 'PROJECT', title: 'AI 落地路线图', desc: '把组织设计、技术可行性和合规性放入同一方案。' }
    ]
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 2 });
  },

  onLoad() {
    this.refreshTextbooks();
  },

  // 从后端单一数据源拉取学习资料；成功则覆盖本地兜底值，弱网/接口异常保留默认值。
  refreshTextbooks() {
    course.getTextbooks()
      .then((data) => {
        const patch = {};
        if (Array.isArray(data.books)) patch.books = data.books;
        if (Array.isArray(data.chapters)) patch.chapters = data.chapters;
        if (Object.keys(patch).length) this.setData(patch);
      })
      .catch((err) => {
        console.warn('[textbooks] 学习资料加载失败，使用本地兜底：', err);
      });
  }
});
