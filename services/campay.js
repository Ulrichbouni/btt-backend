export class CampayService {
  constructor() {
    this.appId = process.env.CAMPAY_APP_ID;
    this.username = process.env.CAMPAY_USERNAME;
    this.password = process.env.CAMPAY_PASSWORD;
    this.accessToken = process.env.CAMPAY_ACCESS_TOKEN;
    this.webhookKey = process.env.CAMPAY_WEBHOOK_KEY;
    this.baseURL = process.env.CAMPAY_SANDBOX === 'true' ? 'https://demo.campay.net/api' : 'https://campay.net/api';
  }

  async getToken() {
    if (this.accessToken) return this.accessToken;
    const response = await fetch(`${this.baseURL}/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password })
    });
    if (!response.ok) throw new Error('Campay auth failed');
    const data = await response.json();
    return data.token;
  }

  async initPayment({ amount, currency = 'XAF', description, externalReference, phone, redirectUrl }) {
    const token = await this.getToken();
    const payload = {
      amount: String(amount),
      currency,
      description,
      external_reference: externalReference,
      customer: { phone_number: phone },
      redirect_url: redirectUrl
    };

    const response = await fetch(`${this.baseURL}/collect/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Token ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || 'Campay init failed');
    }
    return await response.json();
  }

  async verifyPayment(reference) {
    const token = await this.getToken();
    const response = await fetch(`${this.baseURL}/collect/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Token ${token}` }
    });
    if (!response.ok) throw new Error('Campay verify failed');
    return await response.json();
  }
}

export default CampayService;
