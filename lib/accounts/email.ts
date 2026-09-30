import { createTransport, type Transporter } from 'nodemailer'
import type { AccountsConfig } from './config.ts'

/**
 * The one message sign-in sends: a magic link. Plain text, SMTP, no provider
 * named (ARCHITECTURE section 14, "Methods"). The body carries the link and
 * nothing that identifies the instance beyond its origin.
 */

export type Mailer = { send: (to: string, subject: string, text: string) => Promise<void> }

export function smtpMailer(config: Pick<AccountsConfig, 'emailUrl' | 'emailFrom'>): Mailer {
  let transport: Transporter | undefined
  return {
    async send(to, subject, text) {
      transport ??= createTransport(config.emailUrl)
      await transport.sendMail({ from: config.emailFrom, to, subject, text })
    },
  }
}

export function magicLinkMessage(origin: string, url: string): { subject: string; text: string } {
  return {
    subject: 'Sign in to Wave',
    text: [
      `Open this link to sign in to ${origin}:`,
      '',
      url,
      '',
      'It works once and expires in five minutes. If you did not ask for it, ignore this message.',
    ].join('\n'),
  }
}
