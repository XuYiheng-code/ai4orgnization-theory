const course = require('../../services/course.js');

Page({
  data: {
    openWeek: 0,
    stages: [
      {
        no: '01',
        title: '组织理论：解释组织',
        summary: '先回答组织为何存在、如何决策、怎样处理信息和依赖，再用这些概念观察人工智能。',
        weeks: [
          { gidx: 0, no: '01', title: '导论课：人类组织发生、发展、变革与消亡的基本逻辑', blocks: [
            { label: '理论框架', text: '韦伯官僚制理论与数字时代治理（DEG）。' },
            { label: '研讨活动', text: '组织的第一性原理、理性与利益、情感与制度、有限理性与注意力。' }
          ] },
          { gidx: 1, no: '02', title: '有限理性与自动化决策（ADM）', blocks: [
            { label: '理论框架', text: '西蒙的有限理性；监督式与非监督式学习、偏误—方差权衡、回归与分类。' },
            { label: '研讨活动', text: '选择一个公共部门 AI 应用，启动案例与系统架构分析。' }
          ] },
          { gidx: 2, no: '03', title: '信息处理、知识管理与大语言模型（LLMs）', blocks: [
            { label: '理论框架', text: 'Galbraith 的组织信息处理理论；知识表示与语义检索。' },
            { label: '课堂活动', text: '提示词工程工作坊，测试地方政府规章分析与幻觉问题。' }
          ] },
          { gidx: 3, no: '04', title: '资源依赖、云生态与政企互惠', blocks: [
            { label: '理论框架', text: 'Pfeffer 与 Salancik 的资源依赖理论；平台治理。' },
            { label: '本周任务', text: '提交“交付物 1：案例选择与系统架构图”。' }
          ] }
        ]
      },
      {
        no: '02',
        title: '技术嵌入：重塑结构与协作',
        summary: '追踪技术进入工作流程后，内部控制、团队协作、领导方式和变革路径发生的具体变化。',
        weeks: [
          { gidx: 4, no: '05', title: '算法管理与内部控制系统', blocks: [
            { label: '理论框架', text: 'Edwards 的控制类型学；Ouchi 的市场、科层与氏族控制。' },
            { label: '研讨活动', text: '行政效率与一线网格员自主权之间的权衡。' }
          ] },
          { gidx: 5, no: '06', title: '小组动力、人机协作与协同', blocks: [
            { label: '理论框架', text: '动态团队（Flash Teams）、智能增强与代理工作流。' },
            { label: '课堂活动', text: '“绿野仙踪”模拟：在编写代码前模拟 AI 工作流，识别协作瓶颈。' }
          ] },
          { gidx: 6, no: '07', title: '战略领导力与组织变革管理', blocks: [
            { label: '理论框架', text: '双元性领导力；组织数据就绪框架。' },
            { label: '研讨活动', text: '诊断数字基础设施部署中战略对齐与一线执行脱节的原因。' }
          ] },
          { gidx: 7, no: '08', title: '期中案例工作坊：利益相关者对齐与提示词优化', blocks: [
            { label: '课堂活动', text: '让 LLM 扮演“高阻力组织成员”，对利益相关者分析草案进行压力测试。' },
            { label: '本周任务', text: '提交“交付物 2：利益相关者与协作分析备忘录”。' }
          ] }
        ]
      },
      {
        no: '03',
        title: '智能行动者：重构决策与权力',
        summary: '把人工智能视为参与判断和行动的新角色，分析裁量、公共价值、制度稳定与平台权力。',
        weeks: [
          { gidx: 8, no: '09', title: '街头官僚与算法自由裁量权', blocks: [
            { label: '理论框架', text: 'Lipsky 的街头官僚理论；算法厌恶与算法裁量权。' },
            { label: '案例讨论', text: '一线工作者如何规避或操纵自动化任务分配系统。' }
          ] },
          { gidx: 9, no: '10', title: '以人为本的服务设计与公共价值创造', blocks: [
            { label: '理论框架', text: 'Mark Moore 的公共价值战略三角；以人为本的设计与价值主张。' },
            { label: '本周任务', text: '启动“交付物 3”，评估所选 AI 系统的公共价值与行政权衡。' }
          ] },
          { gidx: 10, no: '11', title: '制度理论、官僚神话与敏捷性', blocks: [
            { label: '理论框架', text: 'Meyer 与 Rowan 的制度理论；脱耦、礼仪性合规、敏捷开发与敏捷采购。' },
            { label: '研讨活动', text: '为公共部门从“瀑布式”采购转向“敏捷式”迭代制定变革方案。' }
          ] },
          { gidx: 11, no: '12', title: '数字公共基础设施（DPI）与平台型政府', blocks: [
            { label: '理论框架', text: '公共产品理论与平台政府（GaaP）模型。' },
            { label: '本周任务', text: '提交“交付物 3：公共价值与 SWOT 分析备忘录”。' }
          ] }
        ]
      },
      {
        no: '04',
        title: '公共治理：约束算法与责任',
        summary: '把公平、程序、司法审查和监管放在同一套责任框架中，形成可审计的 AI 实施方案。',
        weeks: [
          { gidx: 12, no: '13', title: '算法偏见、社会公平与代表性官僚制', blocks: [
            { label: '理论框架', text: '代表性官僚制理论与算法公平的数学定义。' },
            { label: '课堂活动', text: '算法审计研讨：识别公开数据集中的代表性偏差。' }
          ] },
          { gidx: 13, no: '14', title: '行政程序、司法审查与自动化决策诉讼', blocks: [
            { label: '理论框架', text: '正当程序原则与自动化决策的司法审查。' },
            { label: '课堂活动', text: '模拟行政听证会，质询自动化系统的可解释性与公平问题。' }
          ] },
          { gidx: 14, no: '15', title: '比较监管与战略技术政策', blocks: [
            { label: '理论框架', text: '响应式监管理论与比较技术政策。' },
            { label: '课堂活动', text: '代表不同利益主体讨论监管沙盒的设计。' }
          ] },
          { gidx: 15, no: '16', title: '期末报告展示：AI 落地路线图', blocks: [
            { label: '结构化周次安排', text: '期末小组展示及专家评审，提交 AI 落地路线图与总结报告。' },
            { label: '内容批注中的另一项规定', text: '第 16 周进行开卷随堂测验，答案分为“最优答案”和“人机协同反思与改进”两部分。两种安排尚需内容团队统一。' }
          ] }
        ]
      }
    ],
    teaching: [
      { time: "30′", title: '理论与基础知识', text: '讲解，并与 AI 数字人对话，介绍概念、理论与现象。' },
      { time: "60′", title: '课堂学术脱口秀', text: '学习者围绕本周主题进行 3 分钟陈述。录音转写进入知识广场，录像片段需另行取得授权。' }
    ],
    assessment: [
      { score: '示例', title: '学习反馈方案（示例）', text: '学术脱口秀与期末随堂测验，作为学习过程反馈的两种形式。' },
      { score: '示例', title: '综合学习反馈（示例）', text: '课堂参与、阶段交付物与期末项目共同构成学习反馈。' }
    ]
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 1 });
  },

  onLoad() {
    this.refreshSyllabus();
  },

  // 从后端单一数据源拉取大纲；成功则覆盖本地兜底值，弱网/接口异常保留默认值。
  refreshSyllabus() {
    course.getSyllabus()
      .then((data) => {
        const patch = {};
        if (Array.isArray(data.stages)) patch.stages = data.stages;
        if (Array.isArray(data.teaching)) patch.teaching = data.teaching;
        if (Array.isArray(data.assessment)) patch.assessment = data.assessment;
        if (Object.keys(patch).length) this.setData(patch);
      })
      .catch((err) => {
        console.warn('[syllabus] 大纲加载失败，使用本地兜底：', err);
      });
  },

  toggleWeek(event) {
    const gidx = event.currentTarget.dataset.gidx;
    this.setData({ openWeek: this.data.openWeek === gidx ? -1 : gidx });
  },

  scrollToStage(event) {
    const sidx = event.currentTarget.dataset.sidx;
    wx.pageScrollTo({ selector: `#stage-${sidx}`, duration: 300 });
  }
});
