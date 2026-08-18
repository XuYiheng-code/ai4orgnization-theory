const privacy = require('../../utils/privacy');

Component({
  properties: {
    visible: { type: Boolean, value: false }
  },
  methods: {
    openDetail() {
      privacy.openPrivacyPage();
    },
    async onAgree() {
      await privacy.requestAuthorize();
      this.triggerEvent('agree');
    },
    onCancel() {
      this.triggerEvent('cancel');
    }
  }
});
