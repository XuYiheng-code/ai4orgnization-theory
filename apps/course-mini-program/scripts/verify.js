#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const miniDir = path.join(projectDir, 'miniprogram');
const webDir = path.resolve(projectDir, '..', 'course-platform-prototype');
const appJson = JSON.parse(fs.readFileSync(path.join(miniDir, 'app.json'), 'utf8'));
const syncManifest = JSON.parse(fs.readFileSync(path.join(projectDir, 'sync-manifest.json'), 'utf8'));
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function walk(dir, result = []) {
  for (const name of fs.readdirSync(dir)) {
    const target = path.join(dir, name);
    if (fs.statSync(target).isDirectory()) walk(target, result);
    else result.push(target);
  }
  return result;
}

for (const page of appJson.pages) {
  for (const extension of ['js', 'json', 'wxml', 'wxss']) {
    assert(fs.existsSync(path.join(miniDir, `${page}.${extension}`)), `页面缺少 ${page}.${extension}`);
  }
}

for (const item of appJson.tabBar.list) {
  assert(appJson.pages.includes(item.pagePath), `tabBar 页面未注册：${item.pagePath}`);
}

for (const item of syncManifest.items) {
  for (const webFile of item.webFiles) {
    assert(fs.existsSync(path.join(webDir, webFile)), `同步清单中的网站文件不存在：${item.feature} · ${webFile}`);
  }
  for (const miniPage of item.miniPages) {
    assert(appJson.pages.includes(miniPage), `同步清单中的小程序页面未注册：${item.feature} · ${miniPage}`);
  }
}

for (const file of walk(projectDir)) {
  if (file.endsWith('.json')) {
    try {
      JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      errors.push(`JSON 无法解析：${path.relative(projectDir, file)} · ${error.message}`);
    }
  }
  if (file.endsWith('.wxml')) {
    const source = fs.readFileSync(file, 'utf8');
    if (/\{\{[^}]*\.[A-Za-z_$][\w$]*\s*\(/.test(source)) {
      errors.push(`WXML 包含方法调用：${path.relative(projectDir, file)}`);
    }
  }
}

const configSource = fs.readFileSync(path.join(miniDir, 'config/index.js'), 'utf8');
const mockMatch = configSource.match(/mockMode:\s*(true|false)/);
assert(mockMatch, 'config/index.js 缺少 mockMode 配置');
if (mockMatch && mockMatch[1] === 'true') {
  console.log('提示：当前为 mockMode: true（骨架模式），接真实后端后请置 false。');
}

if (errors.length) {
  console.error(errors.map(item => `- ${item}`).join('\n'));
  process.exit(1);
}

const statusCount = syncManifest.items.reduce((result, item) => {
  result[item.status] = (result[item.status] || 0) + 1;
  return result;
}, {});
console.log(`检查通过：${appJson.pages.length} 个页面，${appJson.tabBar.list.length} 个底部入口。`);
console.log(`同步清单：${syncManifest.items.length} 项，${Object.entries(statusCount).map(([status, count]) => `${status} ${count}`).join('，')}。`);
