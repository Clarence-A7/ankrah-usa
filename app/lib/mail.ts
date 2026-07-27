import "server-only";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";

/**
 * Branded transactional email for the Next.js side (SMTP via env), mirroring
 * the PHP mailer: UTF-8, and the company logo embedded as an inline cid image
 * (falls back to the wordmark if public/logo.png is missing).
 */
export interface MailAttachment {
  filename: string;
  /** base64 content (used with encoding: "base64"); mutually exclusive with path. */
  content?: string;
  path?: string;
  encoding?: string;
  contentType?: string;
  /** Content-ID for inline images referenced as <img src="cid:..."> in the body. */
  cid?: string;
  contentDisposition?: "inline" | "attachment";
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  /** Inner HTML — wrapped in the branded card automatically. */
  bodyHtml: string;
  /** Optional BCC list — used for broadcasts so recipients don't see each other. */
  bcc?: string[];
  /** Inline images (cid) and/or file attachments (e.g. a PDF). */
  attachments?: MailAttachment[];
}): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.MAIL_PORT || 587),
    secure: Number(process.env.MAIL_PORT) === 465,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });

  const logoPath = path.join(process.cwd(), "public", "logo.png");
  const hasLogo = fs.existsSync(logoPath);
  const attachments = [
    ...(hasLogo ? [{ filename: "logo.png", path: logoPath, cid: "ankrahlogo" }] : []),
    ...(opts.attachments ?? []),
  ];
  const logoHtml = hasLogo
    ? `<img src="cid:ankrahlogo" alt="Ankrah F&amp;L" style="height:46px;width:auto;display:inline-block;border:0;">`
    : `<span style="color:#2e63af;font-size:22px;font-weight:700;">Ankrah F&amp;L</span>`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:30px;border:1px solid #e2e8f0;border-radius:12px;color:#334155;">
      <div style="text-align:center;margin:0 0 16px;">${logoHtml}</div>
      ${opts.bodyHtml}
    </div>`;

  await transporter.sendMail({
    from: `"${process.env.MAIL_FROM_NAME || "Ankrah F&L"}" <${process.env.MAIL_USER}>`,
    to: opts.to,
    bcc: opts.bcc && opts.bcc.length ? opts.bcc : undefined,
    subject: opts.subject,
    html,
    attachments,
  });
}
