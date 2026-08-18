// 课程内容服务：从后端单一数据源拉取首页展示内容
// （课程大纲 / FILM 章节 / 课程介绍 / 入口文案）。
// 与网站共用同一份 course-content.json，后端编辑即两端同步。
const BASE = 'https://www.ai4orgnization-theory.cn';

function getCourseOverview() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + '/v1/course/overview',
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && res.data && !res.data.error) {
          resolve(res.data);
        } else {
          reject(new Error('课程内容加载失败（HTTP ' + res.statusCode + '）'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

module.exports = { getCourseOverview };
