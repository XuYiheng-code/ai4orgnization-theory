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

// 大纲切片：与网站单一数据源对齐（/v1/course/syllabus）。
function getSyllabus() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + '/v1/course/syllabus',
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && res.data && !res.data.error) {
          resolve(res.data);
        } else {
          reject(new Error('课程大纲加载失败（HTTP ' + res.statusCode + '）'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

// 学习资料切片：与网站单一数据源对齐（/v1/course/textbooks）。
function getTextbooks() {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE + '/v1/course/textbooks',
      method: 'GET',
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && res.data && !res.data.error) {
          resolve(res.data);
        } else {
          reject(new Error('学习资料加载失败（HTTP ' + res.statusCode + '）'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

module.exports = { getCourseOverview, getSyllabus, getTextbooks };
