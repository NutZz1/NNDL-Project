const nodemailer = require('nodemailer');

/**
 * Sends the report confirmation (with the tracking ID) to the citizen.
 *
 * - If SMTP_HOST is set, mail goes through that SMTP account (a real provider).
 * - Otherwise it uses an Ethereal TEST inbox: nothing is delivered to a real
 *   address, and a preview URL is returned/logged so the email can be opened.
 */

let transporterPromise = null;

const getTransporter = () => {
  if (!transporterPromise) {
    transporterPromise = (async () => {
      if (process.env.SMTP_HOST) {
        const port = Number(process.env.SMTP_PORT) || 587;
        return {
          test: false,
          transport: nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465,
            auth: process.env.SMTP_USER
              ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
              : undefined,
          }),
        };
      }
      const account = await nodemailer.createTestAccount();
      console.log(`[Email] Using Ethereal TEST inbox (nothing is delivered). Login: ${account.user} at https://ethereal.email`);
      return {
        test: true,
        transport: nodemailer.createTransport({
          host: account.smtp.host,
          port: account.smtp.port,
          secure: account.smtp.secure,
          auth: { user: account.user, pass: account.pass },
        }),
      };
    })().catch((err) => {
      transporterPromise = null; // try again on the next report
      throw err;
    });
  }
  return transporterPromise;
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const trackUrlFor = (code) => {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/?track=${encodeURIComponent(code)}`;
};

const sendReportConfirmation = async ({ to, reportCode, label, severity, area }) => {
  const trackUrl = trackUrlFor(reportCode);
  const { transport, test } = await getTransporter();

  const subject = `CivicScan report received: ${reportCode}`;
  const text = [
    'Thank you for reporting a civic issue with CivicScan.',
    '',
    `Your report ID: ${reportCode}`,
    `Issue: ${label} (${severity} severity)`,
    area ? `Area: ${area}` : '',
    '',
    `Track its progress any time: ${trackUrl}`,
    `or open Track Report on CivicScan and enter the ID above.`,
  ].filter((l) => l !== '' || true).join('\n');

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#0f172a">
    <h2 style="color:#059669;margin-bottom:4px">CivicScan</h2>
    <p>Thank you for reporting a civic issue. Your report has been received.</p>
    <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px;text-align:center;margin:18px 0">
      <div style="font-size:12px;color:#047857;text-transform:uppercase;letter-spacing:.05em">Your report ID</div>
      <div style="font-size:26px;font-weight:700;letter-spacing:.06em;font-family:monospace">${escapeHtml(reportCode)}</div>
    </div>
    <p><strong>Issue:</strong> ${escapeHtml(label)} (${escapeHtml(severity)} severity)${area ? `<br><strong>Area:</strong> ${escapeHtml(area)}` : ''}</p>
    <p><a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">Track this report</a></p>
    <p style="font-size:13px;color:#64748b">You can also open <em>Track Report</em> on CivicScan and enter the ID above.
    Keep this email: the ID is the only way to look up your report.</p>
  </div>`;

  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM || 'CivicScan <no-reply@civicscan.local>',
    to,
    subject,
    text,
    html,
  });

  const previewUrl = test ? nodemailer.getTestMessageUrl(info) || null : null;
  if (previewUrl) console.log(`[Email] Report ${reportCode} -> ${to}. Open the test email: ${previewUrl}`);
  else console.log(`[Email] Report ${reportCode} confirmation sent to ${to}`);

  return { sent: true, previewUrl, trackUrl, testInbox: test };
};

// Short update when the report moves forward (assigned after review, resolved, closed)
const sendStatusUpdate = async ({ to, reportCode, headline, detail }) => {
  const trackUrl = trackUrlFor(reportCode);
  const { transport, test } = await getTransporter();
  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM || 'CivicScan <no-reply@civicscan.local>',
    to,
    subject: `CivicScan ${reportCode}: ${headline}`,
    text: [`Update on your report ${reportCode}: ${headline}.`, detail || '', '', `Track it: ${trackUrl}`].join('\n'),
    html: `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#0f172a">
    <h2 style="color:#059669;margin-bottom:4px">CivicScan</h2>
    <p>Update on your report <strong style="font-family:monospace">${escapeHtml(reportCode)}</strong>:</p>
    <p style="font-size:18px;font-weight:700">${escapeHtml(headline)}</p>
    ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
    <p><a href="${escapeHtml(trackUrl)}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700">Track this report</a></p>
  </div>`,
  });
  const previewUrl = test ? nodemailer.getTestMessageUrl(info) || null : null;
  console.log(`[Email] ${reportCode} status "${headline}" -> ${to}${previewUrl ? ` (test email: ${previewUrl})` : ''}`);
  return { sent: true, previewUrl };
};

module.exports = { sendReportConfirmation, sendStatusUpdate, trackUrlFor };
