import nodemailer from 'nodemailer';
import type { SendMailOptions } from 'nodemailer';
import { Resend, type CreateEmailOptions } from 'resend';
import { getEmailPlatformConfig } from './config';

type EmailAddress = string | string[];

export type EmailAttachment = {
  filename?: string;
  content?: string | Buffer;
  path?: string;
  contentType?: string;
};

export type EmailPayload = {
  from: string;
  to: EmailAddress;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: EmailAddress;
  cc?: EmailAddress;
  bcc?: EmailAddress;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
};

export type EmailSendResponse = {
  data: { id: string } | null;
  error: { message: string } | null;
};

export type EmailTransport = {
  send(payload: EmailPayload): Promise<EmailSendResponse>;
};

type TransportOptions = {
  resendApiKey?: string;
};

function createMailpitTransport(): EmailTransport {
  const transport = nodemailer.createTransport({
    host: process.env.MAILPIT_SMTP_HOST ?? 'localhost',
    port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
    secure: false,
  });

  return {
    async send(payload) {
      const result = await transport.sendMail(payload as SendMailOptions);
      return { data: { id: result.messageId }, error: null };
    },
  };
}

function createResendTransport(apiKey: string): EmailTransport {
  const resend = new Resend(apiKey);

  return {
    async send(payload) {
      const resendPayload: CreateEmailOptions = {
        ...payload,
        html: payload.html ?? '',
      };
      const result = await resend.emails.send(resendPayload);
      return {
        data: result.data?.id ? { id: result.data.id } : null,
        error: result.error?.message ? { message: result.error.message } : null,
      };
    },
  };
}

/**
 * Transport mode follows the platform email config (admin setting → env):
 * `mailpit` captures locally (dev), anything else sends through Resend.
 */
export async function isMailpitEmailTransport(): Promise<boolean> {
  return (await getEmailPlatformConfig()).transport === 'mailpit';
}

export async function createEmailTransport(options: TransportOptions = {}): Promise<EmailTransport> {
  const cfg = await getEmailPlatformConfig();
  if (cfg.transport === 'mailpit') return createMailpitTransport();

  const key = options.resendApiKey ?? cfg.resendApiKey;
  if (!key) {
    throw new Error('Resend API key is not configured (Admin → Email → Ajustes, or RESEND_API_KEY)');
  }
  return createResendTransport(key);
}

/**
 * Fresh transport per call on purpose: the platform config can change at
 * runtime (admin save / rotated key) and must take effect on the next send.
 */
export async function getEmailTransport(): Promise<EmailTransport> {
  return createEmailTransport();
}

export async function sendEmail(payload: EmailPayload): Promise<EmailSendResponse> {
  const transport = await getEmailTransport();
  return transport.send(payload);
}
