const config = require('../config/index');

function key(name, userId) {
  const scope = userId || 'anonymous';
  return `${config.storagePrefix}:${scope}:${name}`;
}

function get(name, fallback, userId) {
  try {
    const value = wx.getStorageSync(key(name, userId));
    return value === '' || value === undefined ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function set(name, value, userId) {
  wx.setStorageSync(key(name, userId), value);
}

function remove(name, userId) {
  wx.removeStorageSync(key(name, userId));
}

module.exports = { get, set, remove, key };
