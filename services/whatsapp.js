import twilio from 'twilio';

export class WhatsAppService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
    } else {
      console.warn('Twilio credentials not configured');
      this.client = null;
    }
  }

  async sendMessage(to, message) {
    if (!this.client) {
      console.log('[WhatsApp Mock]', message);
      return { success: true, mock: true };
    }

    try {
      const result = await this.client.messages.create({
        from: 'whatsapp:' + this.whatsappNumber,
        to: 'whatsapp:' + to,
        body: message
      });
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('WhatsApp error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendVerificationCode(phone) {
    if (!this.client || !this.verifyServiceSid) {
      console.log('[Verify Mock] code for', phone);
      return { success: true, mock: true };
    }
    try {
      const verification = await this.client.verify.v2.services(this.verifyServiceSid).verifications.create({ to: phone });
      return { success: true, status: verification.status };
    } catch (error) {
      console.error('Twilio Verify error:', error);
      return { success: false, error: error.message };
    }
  }

  async checkVerificationCode(phone, code) {
    if (!this.client || !this.verifyServiceSid) {
      console.log('[Verify Mock] check', phone, code);
      return { success: true, mock: true };
    }
    try {
      const verification = await this.client.verify.v2.services(this.verifyServiceSid).verificationChecks.create({ to: phone, code });
      return { success: verification.status === 'approved' };
    } catch (error) {
      console.error('Twilio Verify check error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendDevisNotification(phone, devisId, montant) {
    const message = 'Nouveau devis BTT-LUX - Reference: #' + devisId + ' - Montant estime: ' + (montant?.toLocaleString() || '0') + ' FCFA - Notre equipe vous contactera sous 48h.';
    return this.sendMessage(phone, message);
  }

  async sendPaymentConfirmation(phone, reference, montant, statut) {
    const emoji = statut === 'reussi' ? '' : '';
    const message = emoji + ' Paiement ' + statut + ' - Reference: ' + reference + ' - Montant: ' + (montant?.toLocaleString() || '0') + ' FCFA';
    return this.sendMessage(phone, message);
  }

  async sendMissionNotification(phone, missionId, dateVisite, devisId) {
    const message = 'Nouvelle mission BTT-LUX - Mission #' + missionId + ' - Devis #' + devisId + ' - Date de visite: ' + dateVisite;
    return this.sendMessage(phone, message);
  }
}

export default new WhatsAppService();
