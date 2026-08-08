import nodemailer, { type Transporter } from 'nodemailer';

import { config } from '@/config/env';
import { logger } from '@/config/logger';

export type EmailTemplate =
  | 'welcome'
  | 'verify-email'
  | 'college-approved'
  | 'college-rejected'
  | 'student-invite'
  | 'password-reset'
  | 'password-reset-link'
  | 'password-changed'
  | 'account-locked'
  | 'token-reuse-alert'
  | 'attendance-warning'
  | 'assignment-due'
  | 'result-published'
  | 'certificate-issued'
  | 'interview-scheduled'
  | 'placement-confirmed'
  | 'training-request-status'
  | 'ticket-replied';

/** Security mail always sends: letting a user disable "your password was
 *  changed" removes the one signal that reveals an account takeover. */
const ALWAYS_SEND: ReadonlySet<EmailTemplate> = new Set([
  'password-changed',
  'account-locked',
  'token-reuse-alert',
  'verify-email',
  'password-reset',
  'password-reset-link',
]);

interface EmailProvider {
  send(to: string, subject: string, html: string, text: string): Promise<void>;
}

class ConsoleEmailProvider implements EmailProvider {
  async send(to: string, subject: string, _html: string, text: string): Promise<void> {
    logger.info('Email (console provider)', { to, subject, preview: text.slice(0, 200) });
  }
}

class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth:
        config.email.smtp.user && config.email.smtp.password
          ? { user: config.email.smtp.user, pass: config.email.smtp.password }
          : undefined,
    });
  }

  async send(to: string, subject: string, html: string, text: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"${config.email.fromName}" <${config.email.from}>`,
      to,
      subject,
      html,
      text,
    });
  }
}

function buildProvider(): EmailProvider {
  switch (config.email.provider) {
    case 'smtp':
    case 'sendgrid':
      return new SmtpEmailProvider();
    default:
      return new ConsoleEmailProvider();
  }
}

interface RenderedEmail {
  subject: string;
  heading: string;
  body: string[];
  cta?: { label: string; url: string };
  footer?: string;
}

function render(template: EmailTemplate, data: Record<string, unknown>): RenderedEmail {
  const name = String(data.firstName ?? 'there');

  switch (template) {
    case 'verify-email':
      return {
        subject: 'Verify your email address',
        heading: 'Confirm your email',
        body: [
          `Your verification code is <strong>${String(data.otp)}</strong>.`,
          `It expires in ${String(data.expiresInMinutes ?? 10)} minutes.`,
        ],
      };
    case 'password-reset':
      return {
        subject: 'Your password reset code',
        heading: 'Password reset',
        body: [
          `Your reset code is <strong>${String(data.otp)}</strong>.`,
          `It expires in ${String(data.expiresInMinutes ?? 10)} minutes.`,
          'If you did not request this, you can safely ignore this email.',
        ],
      };
    case 'password-reset-link':
      return {
        subject: 'Reset your Peacefic One password',
        heading: `Hi ${name}`,
        body: ['Use the button below together with the code we sent separately.'],
        cta: { label: 'Reset password', url: String(data.resetUrl) },
      };
    case 'password-changed':
      return {
        subject: 'Your password was changed',
        heading: `Hi ${name}`,
        body: [
          'Your password has just been changed and all other devices were signed out.',
          'If this was not you, contact your administrator immediately.',
        ],
      };
    case 'account-locked':
      return {
        subject: 'Your account was temporarily locked',
        heading: `Hi ${name}`,
        body: [
          `After several failed sign-in attempts your account is locked for ${String(data.minutes)} minutes.`,
          `The attempts came from ${String(data.ip ?? 'an unknown address')}.`,
        ],
      };
    case 'token-reuse-alert':
      return {
        subject: 'Security alert: your session was ended',
        heading: `Hi ${name}`,
        body: [
          'We detected a sign-in token being reused, which can indicate it was stolen.',
          'Every session was ended as a precaution. Please sign in again and change your password.',
        ],
      };
    case 'student-invite':
      return {
        subject: `You have been invited to ${String(data.collegeName ?? 'Peacefic One')}`,
        heading: `Hi ${name}`,
        body: ['Set your password to activate your student account.'],
        cta: { label: 'Set my password', url: String(data.inviteUrl) },
        footer: 'This invitation expires in 7 days.',
      };
    case 'college-approved':
      return {
        subject: 'Your institution has been approved',
        heading: `Welcome, ${String(data.collegeName ?? 'there')}`,
        body: ['Your registration has been approved. You can now sign in and start onboarding.'],
        cta: { label: 'Sign in', url: `${config.clientUrl}/login` },
      };
    case 'college-rejected':
      return {
        subject: 'About your institution registration',
        heading: 'Registration not approved',
        body: [
          'Unfortunately your registration was not approved.',
          `Reason: ${String(data.reason ?? 'Not specified')}`,
        ],
      };
    case 'welcome':
      return {
        subject: 'Welcome to Peacefic One',
        heading: `Welcome, ${name}`,
        body: ['Your account is active. Sign in to get started.'],
        cta: { label: 'Go to Peacefic One', url: config.clientUrl },
      };
    case 'attendance-warning':
      return {
        subject: 'Your attendance is below the required threshold',
        heading: `Hi ${name}`,
        body: [
          `Your attendance is currently <strong>${String(data.percentage)}%</strong>, below the required ${String(data.threshold)}%.`,
          `You need to attend ${String(data.sessionsNeeded ?? 'more')} more sessions to recover.`,
        ],
      };
    default:
      return {
        subject: String(data.subject ?? 'Notification from Peacefic One'),
        heading: `Hi ${name}`,
        body: [String(data.message ?? '')],
      };
  }
}

function toHtml(email: RenderedEmail): string {
  const paragraphs = email.body.map((line) => `<p style="margin:0 0 16px;">${line}</p>`).join('');
  const cta = email.cta
    ? `<p style="margin:24px 0;"><a href="${email.cta.url}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">${email.cta.label}</a></p>`
    : '';
  const footer = email.footer
    ? `<p style="margin:24px 0 0;color:#64748b;font-size:13px;">${email.footer}</p>`
    : '';

  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a;">
<div style="max-width:560px;margin:32px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;">
<h1 style="margin:0 0 20px;font-size:20px;font-weight:600;">${email.heading}</h1>
<div style="font-size:14px;line-height:20px;">${paragraphs}${cta}${footer}</div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0 16px;">
<p style="margin:0;color:#64748b;font-size:12px;">Peacefic One — AI Powered Learning, Placement &amp; Institution Management</p>
</div></body></html>`;
}

function toText(email: RenderedEmail): string {
  const body = email.body.map((line) => line.replace(/<[^>]+>/g, '')).join('\n\n');
  const cta = email.cta ? `\n\n${email.cta.label}: ${email.cta.url}` : '';
  return `${email.heading}\n\n${body}${cta}`;
}

/**
 * Sends are enqueued, never awaited in a request: an SMTP timeout must not turn
 * into a failed registration. Without Redis this degrades to a detached
 * promise, which keeps the same non-blocking contract locally.
 */
export class EmailService {
  private readonly provider: EmailProvider;

  constructor() {
    this.provider = buildProvider();
  }

  async enqueue(
    template: EmailTemplate,
    to: string,
    data: Record<string, unknown> = {},
    options: { respectPreferences?: boolean; optedIn?: boolean } = {},
  ): Promise<void> {
    if (
      options.respectPreferences &&
      options.optedIn === false &&
      !ALWAYS_SEND.has(template)
    ) {
      return;
    }

    const rendered = render(template, data);

    void this.provider
      .send(to, rendered.subject, toHtml(rendered), toText(rendered))
      .catch((error) => {
        logger.error('Email delivery failed', {
          template,
          to,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }
}
