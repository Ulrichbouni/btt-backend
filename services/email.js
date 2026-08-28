import nodemailer from 'nodemailer';

export class EmailService {
  constructor() {
    this.transporter = null;
    this.from = process.env.EMAIL_FROM || 'noreply@btt-lux.com';

    if (process.env.SENDGRID_API_KEY) {
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY }
      });
    } else if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
    }
  }

  async sendMail(to, subject, html, text) {
    if (!this.transporter) {
      console.log('[Email Mock]', subject, to);
      return { success: true, mock: true };
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html,
        text
      });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Email error:', error);
      return { success: false, error: error.message };
    }
  }

  async sendWelcome(nom, email) {
    const subject = 'Bienvenue sur BTT-LUX !';
    const html = '<html><body style=font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#faf7f2;padding:20px><div style=background:#fff;border-radius:10px;padding:30px><h1 style=color:#92400e>Bienvenue ' + nom + ' !</h1><p>Votre compte BTT-LUX est cre avec succes.</p><p>Vous pouvez commander nos panneaux isolants et suivre votre projet.</p><p style=color:#92400e;font-weight:bold>L equipe BTT-LUX</p></div></body></html>';
    return this.sendMail(email, subject, html, 'Bienvenue sur BTT-LUX!\nVotre compte est cree avec succes.');
  }

  async sendDevisConfirmation(nom, email, devisId, montant) {
    const subject = 'Confirmation de votre devis BTT-LUX #' + devisId;
    const html = '<html><body style=font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#faf7f2;padding:20px><div style=background:#fff;border-radius:10px;padding:30px><h1 style=color:#92400e>Confirmation de devis</h1><p>Bonjour ' + nom + ',</p><p>Nous avons bien recu votre demande de devis :</p><div style=background:#fffbeb;border-left:4px solid #f59e0b;padding:15px;margin:20px 0><p>Reference : #' + devisId + '</p><p>Montant : ' + (montant || '0') + ' FCFA</p></div><p>Notre équipe vous contactera sous 48h.</p><p style=color:#92400e;font-weight:bold>BTT-LUX</p></div></body></html>';
    return this.sendMail(email, subject, html, 'Devis #' + devisId + ' bien recu.');
  }

  async sendResetPassword(nom, email, token) {
    const subject = 'Reinitialisation de mot de passe BTT-LUX';
    const resetUrl = (process.env.FRONTEND_URL || 'http://localhost:5173') + '/reset-password?token=' + token;
    const html = '<html><body style=font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#faf7f2;padding:20px><div style=background:#fff;border-radius:10px;padding:30px><h1 style=color:#92400e>Reinitialisation</h1><p>Bonjour ' + nom + ',</p><p>Cliquez pour reinitialiser votre mot de passe :</p><a href=' + resetUrl + ' style=background:#92400e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none>Reinitialiser</a></div></body></html>';
    return this.sendMail(email, subject, html, 'Reinitialisez votre mot de passe: ' + resetUrl);
  }
}

export default new EmailService();
