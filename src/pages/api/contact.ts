import type { APIRoute } from 'astro';
import site from '../../content/settings/site.json';
import contact from '../../content/pages/contact.es.json';
import { forwardLeadToOs } from '../../lib/os-lead-intake';

export const prerender = false;

// Envío vía Resend (API HTTP). El dominio del remitente debe estar verificado en Resend.
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const FROM = 'Alethig Media Web <no-reply@notify.alethigmedia.com>';

// Turnstile (anti-bot). El token del widget se verifica server-side aquí.
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const REQUIRED = ['nombre', 'negocio', 'telefono', 'email'] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const serviceLabel = (value: string) =>
  contact.serviceOptions.find((o) => o.value === value)?.label ?? value ?? '—';

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const env = (locals as any).runtime?.env ?? {};

  const wantsJson =
    request.headers.get('accept')?.includes('application/json') ||
    request.headers.get('x-requested-with') === 'fetch';

  // Rutas de fallback sin JS, según el idioma del formulario que envía
  // (campo oculto "locale"). Español por defecto. OJO: los segmentos de
  // ruta en sí cambian por idioma (contacto/gracias vs contact/thank-you),
  // no solo el prefijo — por eso van completos aquí, no como "base + algo".
  let locale: 'es' | 'en' = 'es';
  let contactPath = '/es/contacto/';
  let thankYouPath = '/es/gracias/';

  const fail = (status: number, error: string) =>
    wantsJson
      ? new Response(JSON.stringify({ ok: false, error }), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      : redirect(`${contactPath}?error=1`, 303);

  // --- Parse (JSON, urlencoded o FormData) ---
  let data: Record<string, string> = {};
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = await request.json();
      data = Object.fromEntries(
        Object.entries(body ?? {}).map(([k, v]) => [k, String(v ?? '').trim()]),
      );
    } else {
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) data[k] = String(v ?? '').trim();
    }
  } catch {
    return fail(400, 'Solicitud inválida.');
  }
  if (data.locale === 'en') {
    locale = 'en';
    contactPath = '/en/contact/';
    thankYouPath = '/en/thank-you/';
  }
  // AUDITORÍA GRATIS — el formulario de /es/auditoria-gratis/ y
  // /en/free-audit/ usa este mismo endpoint con formType=audit: mismos
  // controles (honeypot, Turnstile, campos requeridos), asunto propio y
  // campos extra en el correo. El fallback sin JS vuelve a esa página.
  const isAudit = data.formType === 'audit';
  if (isAudit) contactPath = locale === 'en' ? '/en/free-audit/' : '/es/auditoria-gratis/';

  // --- Honeypot: si el bot rellenó "website", fingir éxito sin guardar ni enviar ---
  if (data.website) {
    return wantsJson
      ? new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        })
      : redirect(thankYouPath, 303);
  }

  // --- Turnstile: verificar token anti-bot server-side ---
  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) {
    console.error('Falta TURNSTILE_SECRET_KEY: no se puede verificar el formulario.');
    return fail(500, 'El formulario no está configurado. Intenta más tarde.');
  }
  const token = data['cf-turnstile-response'];
  if (!token) return fail(400, 'Verificación anti-bot pendiente. Intenta de nuevo.');
  try {
    const body = new FormData();
    body.append('secret', turnstileSecret);
    body.append('response', token);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) body.append('remoteip', ip);
    const tr = await fetch(TURNSTILE_VERIFY, { method: 'POST', body });
    const outcome = (await tr.json()) as { success?: boolean };
    if (!outcome.success) return fail(403, 'Verificación anti-bot fallida. Intenta de nuevo.');
  } catch (e) {
    console.error('Turnstile verify falló:', e);
    return fail(502, 'No se pudo verificar. Intenta de nuevo.');
  }

  // --- Validación ---
  for (const field of REQUIRED) {
    if (!data[field]) return fail(400, 'Faltan campos requeridos.');
  }
  if (!EMAIL_RE.test(data.email)) return fail(400, 'Correo electrónico inválido.');

  const record = {
    nombre: data.nombre,
    negocio: data.negocio,
    telefono: data.telefono,
    email: data.email,
    servicio: serviceLabel(data.servicio),
    mensaje: data.mensaje ?? '',
    ts: new Date().toISOString(),
  };

  // Idioma del visitante, para que quien lea el correo (siempre en
  // español) sepa en qué idioma contactarlo de vuelta.
  const localeLabel = locale === 'en' ? 'Inglés' : 'Español';

  const auditRows: [string, string][] = isAudit
    ? ([
        ['Ciudad', data.ciudad],
        ['Industria', data.industria],
        ['Sitio web', data.sitioWeb],
        ['Google / redes', data.perfiles],
        ['Objetivo principal', data.objetivo],
      ].filter(([, v]) => v) as [string, string][]).map(([k, v]) => [k, v.slice(0, 500)])
    : [];
  if (isAudit) record.servicio = 'AUDITORÍA GRATIS';

  const subject = isAudit
    ? `🔎 Solicitud de AUDITORÍA GRATIS — ${record.nombre} (${record.negocio})`
    : `Nuevo mensaje de contacto — ${record.nombre} (${record.negocio})`;
  const text =
    `Nombre: ${record.nombre}\n` +
    `Negocio: ${record.negocio}\n` +
    `Teléfono: ${record.telefono}\n` +
    `Email: ${record.email}\n` +
    `Servicio: ${record.servicio}\n` +
    `Idioma del visitante: ${localeLabel}\n` +
    auditRows.map(([k, v]) => `${k}: ${v}\n`).join('') +
    `Mensaje:\n${record.mensaje}\n`;
  const html =
    `<h2>${isAudit ? 'Nueva solicitud de auditoría gratis' : 'Nuevo mensaje de contacto'}</h2>` +
    `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">` +
    `<tr><td><b>Nombre</b></td><td>${esc(record.nombre)}</td></tr>` +
    `<tr><td><b>Negocio</b></td><td>${esc(record.negocio)}</td></tr>` +
    `<tr><td><b>Teléfono</b></td><td>${esc(record.telefono)}</td></tr>` +
    `<tr><td><b>Email</b></td><td>${esc(record.email)}</td></tr>` +
    `<tr><td><b>Servicio</b></td><td>${esc(record.servicio)}</td></tr>` +
    `<tr><td><b>Idioma del visitante</b></td><td>${esc(localeLabel)}</td></tr>` +
    auditRows.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('') +
    `<tr><td valign="top"><b>Mensaje</b></td><td>${esc(record.mensaje).replace(/\n/g, '<br>')}</td></tr>` +
    `</table>`;

  // --- Envío vía Resend (única entrega) ---
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Falta RESEND_API_KEY: el formulario no puede entregar.');
    return fail(500, 'El formulario no está configurado. Intenta más tarde.');
  }
  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: [site.contact.email],
        reply_to: record.email,
        subject,
        html,
        text,
      }),
    });
    if (!r.ok) {
      console.error('Resend error', r.status, await r.text().catch(() => ''));
      return fail(502, 'No se pudo enviar. Intenta de nuevo.');
    }
  } catch (e) {
    console.error('Resend fetch falló:', e);
    return fail(502, 'No se pudo enviar. Intenta de nuevo.');
  }

  // --- Copia al CRM de Alethig Media OS (→ HubSpot). Nunca bloquea ni rompe el envío. ---
  await forwardLeadToOs(locals, {
    name: record.nombre,
    email: record.email,
    phone: record.telefono,
    company: record.negocio,
    city: isAudit ? data.ciudad : undefined,
    service: record.servicio,
    message: [
      record.mensaje,
      ...auditRows.map(([k, v]) => `${k}: ${v}`),
      `Idioma: ${localeLabel}`,
    ].filter(Boolean).join('\n'),
    source_detail: isAudit ? 'free_audit_form' : 'contact_form',
  });

  return wantsJson
    ? new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      })
    : redirect(thankYouPath, 303);
};
