import "server-only";
import { sendMail, type MailAttachment } from "./mail";

export interface EmailComposeState {
  success: boolean;
  error?: string;
  message?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );
}

/**
 * Light sanitiser for admin-authored rich email. Content is composed by a
 * trusted internal admin and rendered by the recipient's email client (not the
 * app), so this only strips executable/embedding vectors, not all HTML.
 */
function sanitize(html: string): string {
  return html
    .replace(/<\s*(script|iframe|style|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|style|object|embed)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}

/**
 * Email clients (Gmail/Outlook) strip <img src="data:..."> — so pull every
 * inline data-URI image out of the body and re-attach it as a cid: image.
 */
function inlineImagesToCid(html: string): { html: string; attachments: MailAttachment[] } {
  const attachments: MailAttachment[] = [];
  let i = 0;
  const out = html.replace(
    /<img\b[^>]*?\bsrc=(["'])(data:(image\/[a-zA-Z0-9.+-]+);base64,([^"']+))\1[^>]*>/gi,
    (tag, _q, _data, mime, b64) => {
      const cid = `emb${Date.now()}${i++}@ankrahfl`;
      const ext = (mime.split("/")[1] || "png").replace(/[^a-z0-9]/gi, "");
      attachments.push({
        filename: `image-${i}.${ext}`,
        content: b64,
        encoding: "base64",
        contentType: mime,
        cid,
        contentDisposition: "inline",
      });
      return tag.replace(/\bsrc=(["'])data:[^"']*\1/i, `src="cid:${cid}"`);
    },
  );
  return { html: out, attachments };
}

export interface ComposedEmail {
  /** Recipient email addresses. */
  recipients: string[];
  /** true → send To the single recipient; false → BCC broadcast. */
  individual: boolean;
  subject: string;
  /** Rich HTML body from the composer. */
  html: string;
  pdf?: { filename: string; base64: string } | null;
  senderName: string;
}

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

export async function sendComposedEmail(opts: ComposedEmail): Promise<void> {
  const { html: withCids, attachments } = inlineImagesToCid(sanitize(opts.html));

  if (opts.pdf?.base64) {
    const approxBytes = (opts.pdf.base64.length * 3) / 4;
    if (approxBytes > MAX_PDF_BYTES) {
      throw new Error("PDF attachment exceeds the 10MB limit.");
    }
    attachments.push({
      filename: opts.pdf.filename || "attachment.pdf",
      content: opts.pdf.base64,
      encoding: "base64",
      contentType: "application/pdf",
      contentDisposition: "attachment",
    });
  }

  const bodyHtml =
    `<div style="color:#334155;line-height:1.6;">${withCids}</div>` +
    `<p style="font-size:0.8rem;color:#94a3b8;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px;">` +
    `Sent by ${escapeHtml(opts.senderName)} · Ankrah F&amp;L</p>`;

  if (opts.individual) {
    await sendMail({ to: opts.recipients[0], subject: opts.subject, bodyHtml, attachments });
  } else {
    await sendMail({
      to: process.env.MAIL_USER || opts.recipients[0],
      bcc: opts.recipients,
      subject: opts.subject,
      bodyHtml,
      attachments,
    });
  }
}

/** Optional PDF attachment carried in a compose form. */
export function readPdfAttachment(
  formData: FormData,
): { filename: string; base64: string } | null {
  const base64 = String(formData.get("pdfBase64") || "");
  if (!base64) return null;
  return { filename: String(formData.get("pdfName") || "attachment.pdf"), base64 };
}

/** Reject a body that has no real content (whitespace / empty tags only). */
export function htmlIsEmpty(html: string): boolean {
  const noImgs = html.replace(/<img\b[^>]*>/gi, "x");
  return noImgs.replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim().length === 0;
}
