const askService = require('../../services/ask');
const auth = require('../../services/auth');

const recorderManager = wx.getRecorderManager();
let recordTimer = null;
let messageIdCounter = 1;

function nextMessageId() {
  return `m${messageIdCounter++}`;
}

Page({
  data: {
    statusBarHeight: 44,
    safeAreaBottom: 0,
    messages: [],
    inputValue: '',
    loading: false,
    recording: false,
    recordTime: 0,
    showTools: false,
    pendingAttachments: [],
    scrollIntoView: '',

    // 会话历史（按用户隔离）
    historyDrawer: false,
    historyLoading: false,
    historyList: [],
    historyLoaded: false,
    currentConversationId: '',
    currentConversationTitle: '新对话'
  },

  onLoad() {
    const systemInfo = wx.getSystemInfoSync();
    const safeAreaBottom = systemInfo.safeArea && systemInfo.safeArea.bottom < systemInfo.screenHeight
      ? systemInfo.screenHeight - systemInfo.safeArea.bottom
      : 0;
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 44,
      safeAreaBottom: safeAreaBottom + 8 + 110
    });

    recorderManager.onStart(() => {
      this.setData({ recording: true, recordTime: 0 });
      recordTimer = setInterval(() => {
        this.setData({ recordTime: this.data.recordTime + 1 });
      }, 1000);
    });

    recorderManager.onStop((res) => {
      this.stopRecordTimer();
      this.setData({ recording: false });
      if (!res || !res.tempFilePath) {
        return;
      }
      const duration = res.duration ? Math.round(res.duration / 1000) : this.data.recordTime;
      wx.showLoading({ title: '识别语音中…', mask: true });
      askService.transcribeVoice(res.tempFilePath, 'voice.mp3')
        .then(({ text }) => {
          wx.hideLoading();
          const clean = (text || '').trim();
          if (!clean) {
            wx.showToast({ title: '没听清，请再说一遍', icon: 'none' });
            return;
          }
          this.pushUserMessage(clean);
        })
        .catch((error) => {
          wx.hideLoading();
          wx.showToast({ title: error.message || '语音识别失败', icon: 'none' });
        });
    });

    recorderManager.onError((error) => {
      this.stopRecordTimer();
      this.setData({ recording: false });
      wx.showToast({ title: error.message || '录音失败', icon: 'none' });
    });

    this.bootstrapConversation();
  },

  onShow() {
    if (this.getTabBar()) this.getTabBar().setData({ selected: 4 });
    if (this.data.historyLoaded) this.refreshHistoryList({ silent: true });
  },

  onUnload() {
    this.stopRecordTimer();
  },

  stopRecordTimer() {
    if (recordTimer) {
      clearInterval(recordTimer);
      recordTimer = null;
    }
  },

  onInput(event) {
    this.setData({ inputValue: event.detail.value });
  },

  sendText() {
    const text = this.data.inputValue.trim();
    if (!text && !this.data.pendingAttachments.length) return;
    this.pushUserMessage(text, true);
  },

  async bootstrapConversation() {
    const user = auth.getCurrentUser();
    if (!user) {
      // 未登录：本地空会话，前端操作正常，不弹错误
      this.setData({ currentConversationId: '', currentConversationTitle: '新对话（未登录）' });
      return;
    }
    try {
      const { items } = await askService.listConversations();
      const list = Array.isArray(items) ? items : [];
      if (list.length > 0) {
        const first = list[0];
        const full = await askService.getConversation(first.id).catch(() => ({ conversation: null }));
        const conv = full && full.conversation;
        if (conv && Array.isArray(conv.messages)) {
          const messages = conv.messages.map((m) => ({
            id: nextMessageId(),
            role: m.role,
            content: m.content,
            attachments: m.attachments || []
          }));
          messageIdCounter = Math.max(messageIdCounter, messages.length + 1);
          this.setData({
            messages,
            currentConversationId: conv.id,
            currentConversationTitle: conv.title || first.title || '继续对话',
            historyList: list,
            historyLoaded: true
          });
          return;
        }
      }
      // 没有现存会话：自动建一个空白
      await this._createConversationSilent();
    } catch (error) {
      console.warn('[ask] bootstrap conversation failed', error);
      this.setData({ historyLoaded: true });
    }
  },

  async _createConversationSilent(title) {
    try {
      const { conversation } = await askService.createConversation(title || '');
      if (conversation && conversation.id) {
        this.setData({
          currentConversationId: conversation.id,
          currentConversationTitle: conversation.title || '新对话',
          messages: []
        });
      }
    } catch (error) {
      console.warn('[ask] create conversation failed', error);
    }
  },

  async pushUserMessage(content, clearInput) {
    let convId = this.data.currentConversationId;
    // 没登录或还没有会话：建一个本地空会话
    if (!convId) {
      if (!auth.getCurrentUser()) {
        // 未登录用户给一个本地 id，会话仅内存保存
        convId = `local-${Date.now()}`;
        this.setData({ currentConversationId: convId, currentConversationTitle: '本地对话' });
      } else {
        await this._createConversationSilent();
        convId = this.data.currentConversationId;
        if (!convId) {
          wx.showToast({ title: '会话创建失败，请稍后再试', icon: 'none' });
          return;
        }
      }
    }

    const pending = this.data.pendingAttachments;
    let resolved = [];
    if (pending.length) {
      this.setData({ loading: true });
      try {
        resolved = await Promise.all(
          pending.map(a => askService.uploadAttachment(a.tempFilePath, a.name))
        );
      } catch (error) {
        this.setData({ loading: false });
        wx.showToast({ title: error.message || '附件上传失败', icon: 'none' });
        return;
      }
    }
    const attachments = resolved.length ? resolved : pending.map(a => ({ type: a.type, name: a.name }));
    const message = {
      id: nextMessageId(),
      role: 'user',
      content: content || (attachments.length ? '请看一下我上传的内容' : ''),
      attachments: attachments.map(a => ({ type: a.type, name: a.name }))
    };
    const messages = [...this.data.messages, message];
    this.setData({
      messages,
      inputValue: clearInput ? '' : this.data.inputValue,
      pendingAttachments: [],
      showTools: false,
      loading: false,
      scrollIntoView: `msg-${message.id}`
    });
    this._persistMessage(convId, 'user', message.content, message.attachments, resolved);
    this.fetchReply(messages, resolved, convId);
  },

  _persistMessage(convId, role, content, attachments, resolved) {
    if (!convId || String(convId).startsWith('local-')) return;
    const payload = {
      role,
      content,
      attachments: (resolved && resolved.length ? resolved : attachments || []).map((a) => ({
        type: a.type || a.kind || 'file',
        name: a.name || '附件'
      }))
    };
    askService.appendMessage(convId, payload)
      .then(({ conversation }) => {
        if (conversation) {
          // 首次 user 自动摘要可能改变标题
          if (conversation.title && conversation.title !== this.data.currentConversationTitle) {
            this.setData({ currentConversationTitle: conversation.title });
          }
          if (this.data.historyLoaded) this.refreshHistoryList({ silent: true });
        }
      })
      .catch((error) => {
        console.warn('[ask] persist message failed', error);
      });
  },

  async fetchReply(messages, attachments, convId) {
    this.setData({ loading: true, scrollIntoView: 'msg-typing' });
    try {
      const result = await askService.ask({ messages, attachments: attachments || [] });
      const replyText = (result && result.reply) || '我暂时无法回答这个问题，建议你查阅资料或询问教师。';
      const reply = {
        id: nextMessageId(),
        role: 'assistant',
        content: replyText,
        attachments: []
      };
      const newMessages = [...messages, reply];
      this.setData({
        messages: newMessages,
        loading: false,
        scrollIntoView: `msg-${reply.id}`
      });
      this._persistMessage(convId || this.data.currentConversationId, 'assistant', replyText);
    } catch (error) {
      this.setData({ loading: false });
      wx.showToast({ title: error.message || '请求失败', icon: 'none' });
    }
  },

  openHistory() {
    this.setData({ historyDrawer: true });
    if (!this.data.historyLoaded || this.data.historyList.length === 0) {
      this.refreshHistoryList({ silent: false });
    }
  },

  closeHistory() {
    this.setData({ historyDrawer: false });
  },

  async refreshHistoryList({ silent }) {
    if (!auth.getCurrentUser()) {
      this.setData({ historyList: [], historyLoaded: true });
      if (!silent) {
        wx.showToast({ title: '请先登录查看历史会话', icon: 'none' });
      }
      return;
    }
    this.setData({ historyLoading: !silent });
    try {
      const { items } = await askService.listConversations();
      this.setData({
        historyList: Array.isArray(items) ? items : [],
        historyLoaded: true,
        historyLoading: false
      });
    } catch (error) {
      this.setData({ historyLoading: false });
      if (!silent) wx.showToast({ title: error.message || '加载历史失败', icon: 'none' });
    }
  },

  async selectHistory(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    if (id === this.data.currentConversationId) {
      this.setData({ historyDrawer: false });
      return;
    }
    try {
      const { conversation } = await askService.getConversation(id);
      const list = (conversation && conversation.messages) || [];
      const messages = list.map((m) => ({
        id: nextMessageId(),
        role: m.role,
        content: m.content,
        attachments: m.attachments || []
      }));
      messageIdCounter = Math.max(messageIdCounter, messages.length + 1);
      this.setData({
        messages,
        currentConversationId: conversation ? conversation.id : id,
        currentConversationTitle: conversation ? conversation.title : '对话',
        historyDrawer: false,
        scrollIntoView: ''
      });
    } catch (error) {
      wx.showToast({ title: error.message || '载入对话失败', icon: 'none' });
    }
  },

  async deleteHistory(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: '删除这条对话？',
      content: '删除后将从你的历史记录中消失。',
      confirmText: '删除',
      confirmColor: '#cc3344',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await askService.deleteConversation(id);
          const remaining = this.data.historyList.filter(c => c.id !== id);
          const isCurrent = this.data.currentConversationId === id;
          this.setData({ historyList: remaining });
          if (isCurrent) {
            if (remaining.length > 0) {
              this.selectHistory({ currentTarget: { dataset: { id: remaining[0].id } } });
            } else {
              await this._createConversationSilent();
              this.setData({ messages: [] });
            }
          }
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  async startNewConversation() {
    if (!auth.getCurrentUser()) {
      this.setData({ messages: [], currentConversationId: '', currentConversationTitle: '新对话（未登录）' });
      this.setData({ historyDrawer: false });
      return;
    }
    try {
      await this._createConversationSilent();
      this.setData({ messages: [], historyDrawer: false });
      if (this.data.historyLoaded) this.refreshHistoryList({ silent: true });
    } catch (error) {
      wx.showToast({ title: error.message || '创建失败', icon: 'none' });
    }
  },

  toggleTools() {
    this.setData({ showTools: !this.data.showTools });
  },

  startVoice(event) {
    event.preventDefault();
    const options = { duration: 60000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 24000, format: 'mp3' };
    recorderManager.start(options);
  },

  stopVoice() {
    recorderManager.stop();
  },

  cancelVoice() {
    recorderManager.stop();
  },

  startVoiceTool() {
    this.setData({ showTools: false });
    wx.showToast({ title: '请按住底部“按住 说话”', icon: 'none' });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 3,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const attachments = res.tempFiles.map((file, index) => ({
          type: 'image',
          name: `图片${index + 1}.png`,
          tempFilePath: file.tempFilePath,
          size: file.size
        }));
        this.setData({ pendingAttachments: [...this.data.pendingAttachments, ...attachments], showTools: false });
      }
    });
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({
          pendingAttachments: [...this.data.pendingAttachments, {
            type: 'file',
            name: file.name,
            tempFilePath: file.path,
            size: file.size
          }],
          showTools: false
        });
      }
    });
  },

  removeAttachment(event) {
    const index = event.currentTarget.dataset.index;
    const attachments = [...this.data.pendingAttachments];
    attachments.splice(index, 1);
    this.setData({ pendingAttachments: attachments });
  }
});
