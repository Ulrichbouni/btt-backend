import NotchPay from 'notchpay.js';

const publicKey = process.env.NOTCHPAY_PUBLIC_KEY || process.env.NOTCHPAY_API_KEY;
const sandbox = process.env.NOTCHPAY_SANDBOX === 'true';

const notchpay = publicKey ? new NotchPay(publicKey, { debug: true }) : null;

export class NotchPayService {
  constructor() {}

  getClient() {
    if (!notchpay) throw new Error('NOTCHPAY_PUBLIC_KEY/NOTCHPAY_API_KEY missing');
    return notchpay;
  }

  async initializePayment(paymentData) {
    try {
      const client = this.getClient();
      const payload = {
        currency: paymentData.currency || 'XAF',
        amount: String(paymentData.amount),
        email: paymentData.customer_email,
        phone: paymentData.customer_phone,
        reference: paymentData.reference,
        description: paymentData.description
      };

      const paymentInitiated = await client.payments.initializePayment(payload);
      return { success: true, data: paymentInitiated };
    } catch (error) {
      console.error('NotchPay initialize error:', error);
      return { success: false, error: error.message || 'Erreur lors de l\'initialisation du paiement', details: error };
    }
  }

  async verifyPayment(reference) {
    try {
      const client = this.getClient();
      const paymentDetails = await client.payments.verifyAndFetchPayment(reference);
      return { success: true, data: paymentDetails };
    } catch (error) {
      console.error('NotchPay verify error:', error);
      return { success: false, error: error.message || 'Erreur lors de la vérification du paiement', details: error };
    }
  }

  generateReference(prefix = 'BTT') {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }
}

export default new NotchPayService();
