module.exports = {
  appName: '人工智能与组织管理',
  appId: 'wx23b18a4b1624ec53',
  // 当前 P0 接口暂指向课程站（已验证 HTTPS 200），最终建议切到独立 api.ai4orgnization-theory.cn 子域。
  apiBaseUrl: 'https://www.ai4orgnization-theory.cn',
  mockMode: false,
  requestTimeout: 30000,
  streamEnabled: false,
  storagePrefix: 'aio-course-mini',
  knowledgeDomains: ['course-public', 'class-private']
};
