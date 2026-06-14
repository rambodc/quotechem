import nodemailer from 'nodemailer';
import { defineSecret } from 'firebase-functions/params';

export const EMAIL_SMTP_PASSWORD = defineSecret('EMAIL_SMTP_PASSWORD');
export const EMAIL_SMTP_USER = defineSecret('EMAIL_SMTP_USER');
export const EMAIL_FROM_ADDRESS = defineSecret('EMAIL_FROM_ADDRESS');
export const EMAIL_SECRETS = [EMAIL_SMTP_PASSWORD, EMAIL_SMTP_USER, EMAIL_FROM_ADDRESS];

export const DEFAULT_EMAIL_TEMPLATE_IDS = ['userInvite', 'existingUserAccess', 'rfqConfirmation', 'genericNotification'];

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getSecretValue(secretRef) {
  try {
    return String(secretRef.value() || '').trim();
  } catch {
    return '';
  }
}

function getSmtpConfig() {
  const user = cleanEmail(process.env.EMAIL_SMTP_USER || getSecretValue(EMAIL_SMTP_USER) || process.env.EMAIL_FROM_ADDRESS || getSecretValue(EMAIL_FROM_ADDRESS));
  const pass = String(process.env.EMAIL_SMTP_PASSWORD || getSecretValue(EMAIL_SMTP_PASSWORD) || '').trim();
  const fromAddress = cleanEmail(process.env.EMAIL_FROM_ADDRESS || getSecretValue(EMAIL_FROM_ADDRESS) || user || 'quotes@quotechem.com');
  const fromName = String(process.env.EMAIL_FROM_NAME || 'QuoteChem').trim();

  if (!user || !pass || !fromAddress) {
    const err = new Error('Email sender is not configured. Set EMAIL_SMTP_USER, EMAIL_SMTP_PASSWORD, and EMAIL_FROM_ADDRESS as Firebase Functions secrets.');
    err.status = 500;
    throw err;
  }

  return {
    host: String(process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com').trim(),
    port: Number(process.env.EMAIL_SMTP_PORT || 465),
    secure: String(process.env.EMAIL_SMTP_SECURE || 'true') !== 'false',
    user,
    pass,
    from: fromName ? `"${fromName.replace(/"/g, '')}" <${fromAddress}>` : fromAddress,
  };
}

function shell({ title, preheader = '', body, actionLabel = '', actionUrl = '', footer = 'This message was sent by QuoteChem.' }) {
  const action = actionUrl && actionLabel
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0b5fc0;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:800;">${escapeHtml(actionLabel)}</a></p>`
    : '';
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#ecf3ff;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <div style="max-width:680px;margin:0 auto;padding:28px 12px;">
      <div style="background:#ffffff;border:1px solid #dbe7ff;border-radius:18px;overflow:hidden;">
        <div style="background:#0f2a56;padding:22px 26px;">
          <p style="margin:0;color:#dbeafe;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">QuoteChem</p>
        </div>
        <div style="padding:26px;">
          <h1 style="margin:0 0 16px;font-size:26px;line-height:1.22;color:#0f172a;">${escapeHtml(title)}</h1>
          <div style="font-size:15px;line-height:1.58;color:#334155;">${body}</div>
          ${action}
          <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#64748b;">${escapeHtml(footer)}</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function renderPlaceholders(value, data = {}) {
  return String(value || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const raw = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '';
    return String(raw ?? '');
  });
}

function renderHtmlPlaceholders(value, data = {}) {
  return String(value || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const raw = Object.prototype.hasOwnProperty.call(data, key) ? data[key] : '';
    if (key.endsWith('Html')) return String(raw ?? '');
    return escapeHtml(raw ?? '');
  });
}

export function getDefaultEmailTemplate(templateId) {
  const templates = {
    userInvite: {
      templateId: 'userInvite',
      label: 'User invitation',
      description: 'Sent when an admin invites a new user to finish QuoteChem registration.',
      subject: 'Finish your QuoteChem registration',
      text: [
        '{{inviterName}} invited you to QuoteChem.',
        '',
        'Finish registration:',
        '{{inviteUrl}}',
        '',
        'This invite expires in 7 days and can only be used once.',
      ].join('\n'),
      html: [
        '<p style="margin:0 0 14px;">{{inviterName}} invited you to QuoteChem.</p>',
        '<p style="margin:0 0 14px;">Create your password and profile to access your assigned mini apps.</p>',
        '<p style="margin:0;">This invite expires in 7 days and can only be used once.</p>',
      ].join(''),
      actionLabel: 'Finish registration',
      actionUrlKey: 'inviteUrl',
      footer: 'If you were not expecting this invite, you can ignore this email.',
    },
    existingUserAccess: {
      templateId: 'existingUserAccess',
      label: 'Existing user access',
      description: 'Sent when an existing user is granted or updated access.',
      subject: 'Your QuoteChem access was updated',
      text: ['{{inviterName}} updated your QuoteChem access.', '', 'Open QuoteChem:', '{{signInUrl}}'].join('\n'),
      html: [
        '<p style="margin:0 0 14px;">{{inviterName}} updated your QuoteChem access.</p>',
        '<p style="margin:0;">Sign in to QuoteChem to continue.</p>',
      ].join(''),
      actionLabel: 'Open QuoteChem',
      actionUrlKey: 'signInUrl',
      footer: 'This access update was sent by QuoteChem.',
    },
    rfqConfirmation: {
      templateId: 'rfqConfirmation',
      label: 'RFQ confirmation',
      description: 'Sent to public quote request customers after RFQ submission.',
      subject: 'QuoteChem Request Received - {{chemicalName}}',
      text: ['Thanks for your request. We received your RFQ and started supplier outreach.', '', '{{requestSummaryText}}'].join('\n'),
      html: [
        '<p style="margin:0 0 14px;">Your request is received and our sourcing team has started supplier outreach.</p>',
        '{{requestSummaryHtml}}',
        '<p style="margin:14px 0 0;font-size:13px;color:#64748b;">Final pricing depends on grade, packaging, freight lane, and lead time availability.</p>',
      ].join(''),
      actionLabel: '',
      actionUrlKey: '',
      footer: 'Information in this email is provided for quote preparation and should be confirmed before purchase.',
    },
    genericNotification: {
      templateId: 'genericNotification',
      label: 'Generic notification',
      description: 'Reusable admin test/general notification email.',
      subject: '{{title}}',
      text: '{{message}}',
      html: '<p style="margin:0;">{{message}}</p>',
      actionLabel: '{{actionLabel}}',
      actionUrlKey: 'actionUrl',
      footer: 'This message was sent by QuoteChem.',
    },
  };
  return templates[templateId] ? { ...templates[templateId] } : null;
}

export function buildTemplatedEmail({ templateId, data = {}, override = null }) {
  const template = override?.templateId ? override : { ...getDefaultEmailTemplate(templateId), ...(override || {}) };
  if (!template) {
    const err = new Error('Unknown email template.');
    err.status = 400;
    throw err;
  }
  const subject = renderPlaceholders(template.subject, data);
  const text = renderPlaceholders(template.text, data);
  const actionUrl = template.actionUrlKey ? String(data[template.actionUrlKey] || '') : '';
  const actionLabel = renderPlaceholders(template.actionLabel, data);
  const rawHtml = String(template.html || '');
  const html = shell({
    title: subject,
    preheader: text.split('\n').find(Boolean) || subject,
    body: renderHtmlPlaceholders(rawHtml, data),
    actionLabel,
    actionUrl,
    footer: renderPlaceholders(template.footer, data),
  });
  return { subject, text, html };
}

export async function sendEmail({ to, subject, text, html, replyTo }) {
  const recipient = cleanEmail(to);
  if (!recipient || !subject || (!text && !html)) {
    const err = new Error('Email recipient, subject, and body are required.');
    err.status = 400;
    throw err;
  }

  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  const info = await transporter.sendMail({
    from: config.from,
    to: recipient,
    subject,
    text,
    html,
    replyTo,
  });

  return { messageId: info.messageId || '' };
}

export async function sendTemplatedEmail({ templateId, to, data, override, replyTo }) {
  const rendered = buildTemplatedEmail({ templateId, data, override });
  const result = await sendEmail({ to, ...rendered, replyTo });
  return { ...result, templateId, subject: rendered.subject };
}

export const __emailTestables = {
  buildTemplatedEmail,
  getDefaultEmailTemplate,
  renderPlaceholders,
};
