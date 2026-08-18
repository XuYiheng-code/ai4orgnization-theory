const config = require('../config/index');

const COURSE_CONTEXT = {
  name: '人工智能与组织管理',
  instructor: '于君博',
  ta: '徐亦恒',
  dept: '南京大学政府管理学院',
  weeks: 16,
  format: '每周 90 分钟：30 分钟理论讲授 + 60 分钟学术脱口秀/案例讨论',
  phases: [
    { title: '组织理论：解释组织', weeks: '01—04', concepts: '官僚制、有限理性、信息处理、资源依赖' },
    { title: '技术嵌入：重塑结构与协作', weeks: '05—08', concepts: '算法管理、团队协作、领导力、组织变革' },
    { title: '智能行动者：重构决策与权力', weeks: '09—12', concepts: '裁量权、公共价值、制度张力、平台政府' },
    { title: '公共治理：约束算法与责任', weeks: '13—16', concepts: '算法公平、正当程序、司法审查、监管' }
  ],
  textbooks: {
    A: '《人工智能与公共组织》（课程主教材，逐章建设中）',
    B: '《人工智能基础素养》（生成式 AI、大语言模型、知识库、智能体、幻觉与偏见识别）',
    C: '《AI 实操指南》（提示词、文档处理、知识检索、数据分析、安全使用）'
  },
  keyFigures: ['韦伯 (Max Weber)', '西蒙 (Herbert Simon)', '加尔布雷思 (John Kenneth Galbraith)', '普费弗 (Jeffrey Pfeffer)', '爱德华兹 (Richard Edwards)', '大内 (William Ouchi)', '利普斯基 (Michael Lipsky)', '摩尔 (Mark Moore)', '迈耶 (John Meyer)'],
  assessments: ['课堂参与（学术脱口秀、案例讨论）', '小组/个人作业（围绕公共部门 AI 案例）', '期末考核']
};

function buildSystemPrompt() {
  return [
    `你是《${COURSE_CONTEXT.name}》课程助教，由教师 ${COURSE_CONTEXT.instructor} 与助教 ${COURSE_CONTEXT.ta} 维护。`,
    `课程归属${COURSE_CONTEXT.dept}，共 ${COURSE_CONTEXT.weeks} 周。`,
    '回答问题时请优先基于课程大纲、教材与核心概念；如果不确定，明确告诉学生需要查阅原文或询问教师。',
    '不要编造课程政策、分数比例或教师未公布的安排。',
    `课程四阶段：${COURSE_CONTEXT.phases.map(p => `${p.title}（${p.weeks}）`).join('；')}。`,
    `核心人物：${COURSE_CONTEXT.keyFigures.join('、')}。`,
    `教材：A ${COURSE_CONTEXT.textbooks.A}；B ${COURSE_CONTEXT.textbooks.B}；C ${COURSE_CONTEXT.textbooks.C}。`
  ].join('\n');
}

function keywordReply(text) {
  const t = text.toLowerCase();
  if (/官僚制|韦伯|bureaucracy/.test(t)) {
    return '韦伯的官僚制强调规则、层级、文件化与去人格化。课程用它来解释现代组织为何需要可预期性，也讨论算法管理如何以新形式复刻了这些控制逻辑。你想深入哪一点：规则替代人格、层级与数据流水线，还是官僚制的非预期后果？';
  }
  if (/有限理性|西蒙|simon|bounded rationality/.test(t)) {
    return '西蒙提出“有限理性”：决策者并非追求最优，而是在信息与认知限制下寻找“满意解”。这对理解 AI 辅助决策很关键——大模型扩展了信息搜索空间，但并未消除目标模糊与价值冲突。';
  }
  if (/算法管理|algorithmic management/.test(t)) {
    return '算法管理指用算法分配任务、评估绩效、监控行为。课程讨论它如何改变组织控制：从“人管人”转向“系统管人”，并带来透明度、公平性与劳动者自主性等议题。';
  }
  if (/裁量权|discretion|街头官僚|利普斯基|lipsky/.test(t)) {
    return '利普斯基的“街头官僚”理论指出，基层公务员在面对复杂情境时拥有事实上的裁量权。AI 进入后，部分裁量被编码为规则，但情境判断与价值权衡仍需要人。课程第 9—12 周会重点讨论。';
  }
  if (/公共价值|moore|strategic triangle/.test(t)) {
    return '摩尔提出公共价值的“战略三角”：公共价值、合法性与支持、运作能力。AI 项目不能只讲技术效率，还要回答“为谁创造价值”“是否获得民主合法性”“执行上是否可持续”。';
  }
  if (/算法公平|公平|偏见|bias|fairness/.test(t)) {
    return '算法公平不是单一指标，课程会区分：个体公平、群体公平、程序公平与反事实公平。同时提醒：数据本身携带历史偏见，单纯“优化准确率”可能固化不平等。';
  }
  if (/考核|成绩|评分|作业/.test(t)) {
    return '课程考核方案目前有两套待确认：方案一为“课堂参与 50% + 期末 50%”；方案二为“课堂参与 15% + 作业 15% + 小组展示 20% + 案例分析 20% + 期末 30%”。最终比例以教师公布的教学大纲为准。';
  }
  if (/教材|教科书|textbook/.test(t)) {
    return '课程有三条教材线：A《人工智能与公共组织》（主教材，逐章建设中）、B《人工智能基础素养》、C《AI 实操指南》。你可以去“教材”页查看拟议目录。';
  }
  if (/大纲|周次|week|第.*周/.test(t)) {
    return '课程共 16 周，分四阶段：01—04 组织理论、05—08 技术嵌入、09—12 智能行动者、13—16 公共治理。你可以在“大纲”页展开每周的详细内容。';
  }
  if (/你是谁|你能做什么|功能/.test(t)) {
    return `我是《${COURSE_CONTEXT.name}》课程智能问答助手，熟悉课程大纲、教材结构与核心概念。你可以用文字、语音、图片或文档向我提问，我会尽量基于课程内容回答。`;
  }
  return null;
}

function mockAsk({ messages, attachments }) {
  return new Promise((resolve) => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const text = lastUser ? lastUser.content : '';
    const attachmentNames = (attachments || []).map(a => a.name).filter(Boolean);
    const prefix = attachmentNames.length ? `我已收到你上传的 ${attachmentNames.join('、')}。` : '';

    setTimeout(() => {
      const reply = keywordReply(text);
      if (reply) return resolve({ reply: prefix + reply });

      const fallback = [
        prefix,
        `这个问题很有意思。根据《${COURSE_CONTEXT.name}》的课程设置，建议从组织理论、技术嵌入、智能行动者、公共治理四个阶段去拆解。`,
        '你可以补充更具体的概念或周次，我会帮你定位到课程对应的内容。'
      ].filter(Boolean).join('\n\n');
      resolve({ reply: fallback });
    }, 800 + Math.random() * 700);
  });
}

function ask({ messages, attachments }) {
  if (config.mockMode) return mockAsk({ messages, attachments });

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.apiBaseUrl}/v1/ask`,
      method: 'POST',
      timeout: config.requestTimeout,
      header: { 'Content-Type': 'application/json' },
      data: { messages, attachments, system: buildSystemPrompt() },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error('问答服务暂时不可用，请稍后再试。'));
        }
        resolve(response.data);
      },
      fail() {
        reject(new Error('网络请求失败，请检查网络后重试。'));
      }
    });
  });
}

function uploadAttachment(filePath, name) {
  if (config.mockMode) {
    // mock 模式：不真正上传，直接返回本地占位附件
    return Promise.resolve({
      type: guessAttachmentType(name || filePath),
      url: `mock://${name || filePath}`,
      name: name || filePath.split('/').pop(),
    });
  }
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.apiBaseUrl}/v1/upload`,
      filePath,
      name: 'file',
      timeout: config.requestTimeout,
      success(res) {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('附件上传失败，请重试。'));
        }
        let data;
        try {
          data = JSON.parse(res.data);
        } catch (e) {
          return reject(new Error('附件上传返回异常。'));
        }
        if (!data || !data.url) {
          return reject(new Error('附件上传未返回可访问地址。'));
        }
        resolve({
          type: guessAttachmentType(data.name || name || filePath),
          url: data.url,
          name: data.name || (name || filePath.split('/').pop()),
        });
      },
      fail() {
        reject(new Error('附件上传网络请求失败，请检查网络后重试。'));
      },
    });
  });
}

function guessAttachmentType(name) {
  const ext = (name || '').toLowerCase().split('.').pop();
  const images = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
  const docs = ['pdf', 'md', 'txt', 'doc', 'docx'];
  if (images.includes(ext)) return 'image';
  if (docs.includes(ext)) return 'document';
  return 'file';
}

function transcribeVoice(filePath, name) {
  if (config.mockMode) {
    // mock 模式：返回一个稳定占位，便于联调 UI
    return Promise.resolve({ text: '（语音转写占位）这是一段通过语音输入的提问示例。' });
  }
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.apiBaseUrl}/v1/asr`,
      filePath,
      name: 'file',
      timeout: config.requestTimeout,
      success(res) {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('语音识别失败，请重试或改用文字。'));
        }
        let data;
        try {
          data = JSON.parse(res.data);
        } catch (e) {
          return reject(new Error('语音识别返回异常。'));
        }
        if (!data || !data.text) {
          return reject(new Error(data && data.error ? data.error : '未能识别语音内容。'));
        }
        resolve({ text: data.text });
      },
      fail() {
        reject(new Error('语音上传失败，请检查网络后重试。'));
      },
    });
  });
}

// ────────────────── 会话历史（按用户隔离） ──────────────────
function _requestJson({ url, method = 'GET', data }) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      timeout: config.requestTimeout,
      data: data || {},
      header: { 'Content-Type': 'application/json' },
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = (response.data && (response.data.error || response.data.reply)) || `请求失败（${response.statusCode}）`;
          return reject(new Error(message));
        }
        resolve(response.data || {});
      },
      fail() { reject(new Error('网络请求失败，请检查网络后重试。')); }
    });
  });
}

function listConversations() {
  if (config.mockMode) return Promise.resolve({ items: [] });
  return _requestJson({ url: `${config.apiBaseUrl}/v1/conversations` });
}

function createConversation(title) {
  if (config.mockMode) {
    const id = `local-${Date.now()}`;
    return Promise.resolve({ conversation: { id, title: title || '新对话', preview: '', messageCount: 0, updatedAt: Date.now(), createdAt: Date.now() } });
  }
  return _requestJson({ url: `${config.apiBaseUrl}/v1/conversations`, method: 'POST', data: { title: title || '' } });
}

function getConversation(id) {
  if (!id) return Promise.resolve({ conversation: null });
  if (config.mockMode || id.startsWith('local-')) {
    return Promise.resolve({ conversation: null });
  }
  return _requestJson({ url: `${config.apiBaseUrl}/v1/conversations/${encodeURIComponent(id)}` });
}

function appendMessage(id, { role, content, attachments }) {
  if (!id) return Promise.resolve(null);
  if (config.mockMode || id.startsWith('local-')) {
    return Promise.resolve({ messageCount: 0 });
  }
  return _requestJson({
    url: `${config.apiBaseUrl}/v1/conversations/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: { appendMessage: { role, content, attachments: attachments || [] } }
  });
}

function deleteConversation(id) {
  if (!id) return Promise.resolve(null);
  if (config.mockMode || id.startsWith('local-')) {
    return Promise.resolve({ ok: true });
  }
  return _requestJson({ url: `${config.apiBaseUrl}/v1/conversations/${encodeURIComponent(id)}`, method: 'DELETE' });
}

module.exports = { ask, uploadAttachment, transcribeVoice, buildSystemPrompt, COURSE_CONTEXT,
  listConversations, createConversation, getConversation, appendMessage, deleteConversation };
