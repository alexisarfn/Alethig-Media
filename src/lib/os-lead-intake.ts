// Reenvía un lead del sitio al CRM de Alethig Media OS (app.alethigmedia.com),
// que a su vez lo copia a HubSpot. Es un paso EXTRA: el correo de Resend
// sigue siendo la entrega principal, así que un fallo aquí nunca rompe el
// formulario ni el chat — solo se registra en los logs.
//
// Requiere en Cloudflare (Workers → Settings → Variables):
//   OS_LEAD_INTAKE_URL    = https://app.alethigmedia.com/api/leads/intake
//   OS_LEAD_INTAKE_SECRET = (el mismo valor que LEAD_INTAKE_SECRET en Railway)
// Sin estas dos variables no hace nada.

export interface OsLeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  city?: string;
  service?: string;
  message?: string;
  source_detail: 'contact_form' | 'free_audit_form' | 'chatbot';
}

const TIMEOUT_MS = 5000;

async function post(env: Record<string, string | undefined>, payload: OsLeadPayload): Promise<void> {
  const url = env.OS_LEAD_INTAKE_URL;
  const secret = env.OS_LEAD_INTAKE_SECRET;
  if (!url || !secret) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!r.ok) console.error('OS lead intake respondió', r.status);
  } catch (e) {
    console.error('OS lead intake falló (ignorado):', (e as Error)?.name ?? e);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Envía el lead sin retrasar la respuesta al visitante cuando el runtime
 * ofrece waitUntil (Cloudflare); si no, espera como máximo TIMEOUT_MS.
 */
export async function forwardLeadToOs(locals: unknown, payload: OsLeadPayload): Promise<void> {
  const runtime = (locals as any)?.runtime;
  const env = runtime?.env ?? {};
  const task = post(env, payload);
  const waitUntil = runtime?.ctx?.waitUntil;
  if (typeof waitUntil === 'function') {
    waitUntil.call(runtime.ctx, task);
    return;
  }
  await task;
}
