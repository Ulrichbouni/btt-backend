import twilio from "twilio";

export class WhatsAppService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

    if (this.accountSid && this.authToken) {
      this.client = twilio(this.accountSid, this.authToken);
    } else {
      console.warn("Twilio credentials not configured");
      this.client = null;
    }
  }

  async sendMessage(to, message) {
    if (!this.client) {
      console.log("[WhatsApp Mock]", message);
      return { success: true, mock: true };
    }

    try {
      const result = await this.client.messages.create({
        from: `whatsapp:${this.whatsappNumber}`,
        to: `whatsapp:${to}`,
        body: message
      });

      return { success: true, sid: result.sid };
    } catch (error) {
      console.error("WhatsApp error:", error);
      return { success: false, error: error.message };
    }
  }

  async sendVerificationCode(phone) {
    if (!this.client || !this.verifyServiceSid) {
      console.log("[Verify Mock] code for", phone);
      return { success: true, mock: true };
    }

    try {
      const verification = await this.client.verify.v2.services(this.verifyServiceSid).verifications.create({
        to: phone
      });
      return { success: true, status: verification.status };
    } catch (error) {
      console.error("Twilio Verify error:", error);
      return { success: false, error: error.message };
    }
  }

  async checkVerificationCode(phone, code) {
    if (!this.client || !this.verifyServiceSid) {
      console.log("[Verify Mock] check", phone, code);
      return { success: true, mock: true };
    }

    try {
      const verification = await this.client.verify.v2.services(this.verifyServiceSid).verificationChecks.create({
        to: phone,
        code
      });
      return { success: verification.status === "approved" };
    } catch (error) {
      console.error("Twilio Verify check error:", error);
      return { success: false, error: error.message };
    }
  }

  async sendDevisNotification(phone, devisId, montant) {
    const message = `Nouveau devis BTT-LUX\n\nRéférence: #${devisId}\nMontant estimé: ${montant?.toLocaleString() || '0'} FCFA\n\nNotre équipe vous contactera sous 48h pour confirmer.\n\nMerci de votre confiance !`;
    return this.sendMessage(phone, message);
  }

  async sendPaymentConfirmation(phone, reference, montant, statut) {
    const emoji = statut === 'reussi' ? 'OK' : 'KO';
    const message = `${emoji} Paiement ${statut}\n\nRéférence: ${reference}\nMontant: ${montant?.toLocaleString()} FCFA\n\n${statut === 'reussi' ? 'Merci pour votre paiement !' : 'Le paiement a échoué. Veuillez réessayer.'}`;
    return this.sendMessage(phone, message);
  }
}

export default new WhatsAppService();
