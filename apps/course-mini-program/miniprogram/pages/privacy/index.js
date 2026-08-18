Page({
  data: {},
  onBack() {
    if (getCurrentPages().length > 1) wx.navigateBack();
  }
});
