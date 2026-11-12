import site from '../content/settings/site.json';
import type { ChatLocale } from './chatbot-context';

// Chatbot V2 — captura de leads. Reutiliza la misma infraestructura de
// Resend que ya usa src/pages/api/contact.ts (mismo secret RESEND_API_KEY,
// mismo FROM/dominio verificado, mismo destinatario), pero como un envío
// SEPARADO — no se reutiliza el handler de contact.ts porque su modelo de
// validación (todos los campos requeridos) no encaja con un lead
// conversacional y progresivo, que puede llegar con solo algunos campos.
//
// Cualquier fallo aquí se registra y se ignora — nunca debe romper la
// conversación del visitante (ver el llamado en chat.ts, envuelto en
// try/catch adicional por seguridad).

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'Alethig Media Web <no-reply@notify.alethigmedia.com>';

export type ChatLead = {
  name?: string;
  business?: string;
  business_type?: string;
  location?: string;
  phone?: string;
  email?: string;
  service_interest?: string;
  marketing_goal?: string;
};

export type ChatHistoryMessage = { role: 'user' | 'assistant'; content: string };

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Resumen corto de la conversación para dar contexto humano en el correo —
// no es una transcripción completa ni se vuelve a mostrar al visitante.
const MAX_SUMMARY_TURNS = 12;
const MAX_SUMMARY_LINE_LEN = 200;

function summarizeConversation(history: ChatHistoryMessage[], locale: ChatLocale): string {
  const whoLabel = locale === 'en' ? { user: 'Visitor', assistant: 'Assistant' } : { user: 'Visitante', assistant: 'Asistente' };
  return history
    .slice(-MAX_SUMMARY_TURNS)
    .map((m) => {
      const who = whoLabel[m.role];
      const text = m.content.length > MAX_SUMMARY_LINE_LEN ? m.content.slice(0, MAX_SUMMARY_LINE_LEN) + '…' : m.content;
      return `${who}: ${text}`;
    })
    .join('\n');
}

const FIELD_LABELS: Record<ChatLocale, Record<keyof ChatLead, string>> = {
  es: {
    name: 'Nombre', business: 'Negocio', business_type: 'Tipo de negocio', location: 'Ubicación',
    phone: 'Teléfono', email: 'Email', service_interest: 'Servicio de interés', marketing_goal: 'Objetivo principal',
  },
  en: {
    name: 'Name', business: 'Business', business_type: 'Business type', location: 'Location',
    phone: 'Phone', email: 'Email', service_interest: 'Service of interest', marketing_goal: 'Main goal',
  },
};

// Envía el lead por Resend. Nunca lanza — cualquier error se registra por
// consola (visible en `wrangler tail`) y la función retorna normalmente,
// para que el chat del visitante nunca se vea afectado por un fallo aquí.
export async function sendChatLead(
  env: any,
  locale: ChatLocale,
  lead: ChatLead,
  history: ChatHistoryMessage[],
): Promise<void> {
  const apiKey = env?.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Falta RESEND_API_KEY: no se puede enviar el lead del chatbot.');
    return;
  }

  const labels = FIELD_LABELS[locale] ?? FIELD_LABELS.es;
  const fieldOrder: (keyof ChatLead)[] = [
    'name', 'business', 'business_type', 'location', 'phone', 'email', 'service_interest', 'marketing_goal',
  ];
  const presentFields = fieldOrder
    .map((key) => [labels[key], lead[key]] as const)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0);

  // V3.1 — hora de Nueva York (no UTC), asunto que se entiende en la
  // bandeja del celular, y botones para responder con un toque.
  const now = new Date();
  const ts = now.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' (NY)';
  const localeLabel = locale === 'en' ? 'English' : 'Español';
  const summary = summarizeConversation(history, locale);

  const who = lead.name || lead.business || lead.business_type || 'sin nombre';
  const what = lead.service_interest ? ` · ${lead.service_interest}` : '';
  const subject = `🔥 Lead del chatbot: ${who}${what}`;

  const digits = (lead.phone ?? '').replace(/\D/g, '');
  const waDigits = digits.length === 10 ? `1${digits}` : digits;
  const actions: { label: string; href: string }[] = [];
  if (digits.length >= 7) {
    actions.push({ label: '📞 Llamar', href: `tel:+${waDigits}` });
    actions.push({ label: '💬 WhatsApp', href: `https://wa.me/${waDigits}` });
  }
  if (lead.email) actions.push({ label: '✉️ Responder por email', href: `mailto:${lead.email}` });

  const textLines = [
    `Recibido: ${ts}`,
    `Idioma: ${localeLabel}`,
    ...presentFields.map(([label, value]) => `${label}: ${value}`),
    `Fuente: chatbot de alethigmedia.com`,
    '',
    ...actions.map((a) => `${a.label}: ${a.href}`),
    '',
    'Conversación:',
    summary,
  ];

  const htmlRows = [
    ...presentFields.map(([label, value]) => `<tr><td style="color:#666">${esc(label)}</td><td><b>${esc(String(value))}</b></td></tr>`),
    `<tr><td style="color:#666">Idioma</td><td>${esc(localeLabel)}</td></tr>`,
    `<tr><td style="color:#666">Recibido</td><td>${esc(ts)}</td></tr>`,
    `<tr><td style="color:#666">Fuente</td><td>Chatbot de alethigmedia.com</td></tr>`,
  ].join('');

  const buttons = actions
    .map((a) => `<a href="${esc(a.href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 14px;background:#000326;color:#D8A62B;border-radius:8px;text-decoration:none;font-weight:bold">${esc(a.label)}</a>`)
    .join('');

  const html =
    `<div style="font-family:sans-serif;max-width:560px">` +
    `<h2 style="margin:0 0 8px">Nuevo lead del chatbot</h2>` +
    `<p style="margin:0 0 12px;color:#444">Respóndele lo antes posible con uno de estos botones.</p>` +
    (buttons ? `<p>${buttons}</p>` : '') +
    `<table cellpadding="6" style="border-collapse:collapse">${htmlRows}</table>` +
    `<p><b>Conversación:</b></p>` +
    `<pre style="white-space:pre-wrap;font-family:sans-serif;background:#f4f4f4;padding:10px;border-radius:8px">${esc(summary)}</pre>` +
    `</div>`;

  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [site.contact.email],
        ...(lead.email ? { reply_to: lead.email } : {}),
        subject,
        html,
        text: textLines.join('\n'),
      }),
    });
    if (!r.ok) {
      console.error('Resend error (lead del chatbot)', r.status, await r.text().catch(() => ''));
    }
  } catch (e) {
    console.error('Resend fetch falló (lead del chatbot):', e);
  }
}
