import type { APIRoute } from 'astro';
import { buildChatContext, buildSystemPrompt, type ChatLocale } from '../../lib/chatbot-context';
import { sendChatLead, type ChatLead } from '../../lib/chat-lead';
import { forwardLeadToOs } from '../../lib/os-lead-intake';

export const prerender = false;

// Chatbot V1 — Workers AI vía binding de cuenta (sin API key, ver
// wrangler.jsonc: "ai": { "binding": "AI" }). Modelo confirmado vigente
// (no deprecado) contra el catálogo de Workers AI al momento de
// implementar — @cf/meta/llama-3.1-8b-instruct-fast (128k de contexto,
// multilingüe). Si Cloudflare lo retira en el futuro, cambiar solo esta
// constante.
// Chatbot V3 — modelo principal más capaz (70B) con JSON Mode de Workers AI
// (response_format json_schema): el modelo queda obligado a devolver el
// objeto con la forma de abajo, en vez de "pedírselo" solo en el prompt —
// que es lo que hacía que el 8B a veces respondiera prosa con listas de
// markdown o con el esquema pegado al final. Ambos modelos están en la lista
// oficial de JSON Mode de Workers AI.
//
// Si el modelo principal falla por cualquier motivo (límite de uso de la
// cuenta, modelo retirado, error transitorio), se reintenta con el modelo
// anterior (8B), igual que en V2 — el visitante nunca ve la diferencia.
const PRIMARY_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const FALLBACK_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast';
const MAX_TOKENS = 550;

const REPLY_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    quickReplies: { type: 'array', items: { type: 'string' } },
    showContactActions: { type: 'boolean' },
    lead: {
      type: 'object',
      properties: {
        name: { type: 'string' }, business: { type: 'string' }, business_type: { type: 'string' },
        location: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' },
        service_interest: { type: 'string' }, marketing_goal: { type: 'string' },
      },
    },
  },
  required: ['message'],
};

// --- Validación de entrada (spec aprobada, sección F/G) ---
const MAX_MESSAGE_LEN = 500;
const MAX_HISTORY = 16;
const MAX_BODY_CHARS = 8000; // guarda burda contra payloads enormes, antes de parsear JSON

// --- Rate limiting (spec aprobada, sección D) — obligatorio en V1 ---
// Binding nativo de Rate Limiting de Cloudflare (wrangler.jsonc: "ratelimits"),
// no KV: el conteo KV manual (lectura+escritura no atómica) se probó en vivo
// y se pudo saltar por completo con una ráfaga de 10 solicitudes concurrentes
// desde una misma IP (el contador final quedó en 3, no en 10). El binding
// nativo evalúa el límite en el borde de Cloudflare de forma atómica, sin
// esa condición de carrera. El límite real (8 solicitudes / 60s) se define
// en wrangler.jsonc, no aquí — ver el binding "CHAT_RATE_LIMIT".
//
// env.CHAT_RATE_LIMIT.limit({ key }) solo devuelve { success: boolean } — no
// expone el conteo restante ni el instante en que se reinicia la ventana, así
// que el valor de Retry-After abajo NO sale de la API (que no ofrece esa
// información): es el período configurado en wrangler.jsonc, usado como cota
// conservadora, no como un cálculo exacto del tiempo restante.
const RATE_LIMIT_PERIOD_SECONDS = 60; // debe coincidir con "period" en wrangler.jsonc

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const json = (status: number, body: Record<string, unknown>, extraHeaders?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(extraHeaders ?? {}) },
  });

const isValidLocale = (v: unknown): v is ChatLocale => v === 'es' || v === 'en';

const isValidHistory = (v: unknown): v is ChatMessage[] => {
  if (!Array.isArray(v) || v.length > MAX_HISTORY) return false;
  return v.every(
    (m) =>
      m &&
      typeof m === 'object' &&
      (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' &&
      m.content.length > 0 &&
      m.content.length <= MAX_MESSAGE_LEN,
  );
};

// --- Chatbot V2: contrato de respuesta estructurada del modelo ---
// El modelo (instruido en el system prompt, ver chatbot-context.ts) responde
// SIEMPRE con un único objeto JSON. Nunca se confía ciegamente en su forma:
// si el JSON sale mal formado o no calza con lo esperado, se degrada a texto
// plano sin romper la UI (ver parseModelReply). Nada de esto crashea nunca.
type ParsedReply = {
  message: string;
  quickReplies?: string[];
  showContactActions?: boolean;
  lead?: ChatLead;
};

const MAX_QUICK_REPLIES = 6;
const MAX_QUICK_REPLY_LEN = 60;
const LEAD_FIELDS: (keyof ChatLead)[] = [
  'name', 'business', 'business_type', 'location', 'phone', 'email', 'service_interest', 'marketing_goal',
];

// Extrae solo los campos de lead reconocidos y con forma de string — nunca
// se copia nada que el modelo haya inventado fuera de este esquema fijo.
function sanitizeLead(raw: unknown): ChatLead | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: ChatLead = {};
  let any = false;
  for (const key of LEAD_FIELDS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim().length > 0 && v.length <= 200) {
      out[key] = v.trim();
      any = true;
    }
  }
  return any ? out : undefined;
}

function sanitizeQuickReplies(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned = raw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= MAX_QUICK_REPLY_LEN)
    .slice(0, MAX_QUICK_REPLIES);
  return cleaned.length > 0 ? cleaned : undefined;
}

// El modelo a veces envuelve el JSON en fences de markdown pese a la
// instrucción de no hacerlo — se despoja de forma barata antes de parsear,
// sin cambiar el comportamiento si no están presentes.
function stripCodeFences(s: string): string {
  return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
}

// Caso observado en pruebas reales: el modelo responde en prosa normal y
// luego, en vez de JSON válido, pega líneas sueltas tipo
// "quickReplies: [...]" / "showContactActions: false" / "lead: {}" sin
// llaves — no es extraíble como JSON (ver parseModelReply), así que se
// recorta desde abajo cualquier bloque final de líneas que empiece con una
// de esas claves, para no mostrarle ese eco crudo del esquema al visitante.
function stripTrailingSchemaEcho(text: string): string {
  // De arriba hacia abajo: en cuanto aparece una línea que empieza con una
  // de las claves del esquema, se corta todo desde ahí hasta el final —
  // sin exigir que las líneas siguientes TAMBIÉN calcen con el patrón, ya
  // que en pruebas reales el eco a veces sigue como una lista con viñetas
  // ("quickReplies:\n- Opción 1\n- Opción 2...") que no repite la clave en
  // cada línea.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(quickReplies|showContactActions|lead)\s*:/i.test(lines[i])) {
      const stripped = lines.slice(0, i).join('\n').trim();
      // Si por alguna razón todo el texto era eco del esquema (nada antes),
      // es mejor mostrar el texto original tal cual que una burbuja vacía.
      return stripped.length > 0 ? stripped : text.trim();
    }
  }
  return text.trim();
}

// V3 — el prompt prohíbe markdown, pero si igual se cuela (listas con
// "* " o "- ", negritas con **), se aplana a texto corrido: la burbuja del
// chat no renderiza markdown y los asteriscos se veían crudos.
function flattenMarkdown(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const out = lines.map((l) => l.replace(/^([*\-•]|\d+[.)])\s+/, '')).join(' ');
  return out.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

// Nunca lanza. Acepta `raw` en DOS formas posibles de result.response de
// Workers AI: normalmente un string (que puede o no ser JSON válido), pero
// quando el modelo produce una salida que "parece" JSON, Workers AI a veces
// entrega result.response YA COMO OBJETO parseado, no como string — esto se
// confirmó en pruebas reales (ver historial): el mismo prompt, con el mismo
// modelo, devolvió un objeto directamente en algunos turnos. Si no se
// contempla este caso, un reply perfectamente válido se trataba como
// "vacío" (typeof !== 'string') y fallaba con 502 — un bug real, no una
// falla del modelo. Si el JSON (en cualquiera de las dos formas) no calza
// con el esquema esperado, se degrada a texto plano sin romper la UI.
function parseModelReply(raw: unknown): ParsedReply | null {
  let obj: any;
  let rawText: string | null = null;

  if (typeof raw === 'string') {
    rawText = raw;
    try {
      obj = JSON.parse(stripCodeFences(raw));
    } catch {
      // A veces el modelo responde con texto normal Y ADEMÁS pega un bloque
      // JSON suelto (por ejemplo, repite su propia instrucción de formato) —
      // se probó en vivo: prosa + "\n\n{...}" al final, lo que no es JSON
      // válido como string completo. Se intenta extraer el primer bloque
      // {...} balanceado ingenuamente (primera '{' a última '}') como
      // segundo intento antes de rendirse al texto plano completo (que en
      // ese caso mostraría el JSON crudo al visitante — justo lo que se
      // quiere evitar).
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          obj = JSON.parse(match[0]);
        } catch {
          obj = undefined;
        }
      }
      if (!obj) {
        console.error('Chatbot: el modelo no devolvió JSON válido, usando texto plano. Salida cruda (primeros 300 caracteres):', raw.slice(0, 300));
        return { message: flattenMarkdown(stripTrailingSchemaEcho(raw)) };
      }
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw; // Workers AI ya lo entregó parseado — ver nota arriba
  } else {
    return null;
  }

  if (obj && typeof obj === 'object' && typeof obj.message === 'string' && obj.message.trim().length > 0) {
    return {
      message: flattenMarkdown(obj.message),
      quickReplies: sanitizeQuickReplies(obj.quickReplies),
      showContactActions: obj.showContactActions === true,
      lead: sanitizeLead(obj.lead),
    };
  }
  console.error('Chatbot: el modelo devolvió JSON con forma inesperada.', JSON.stringify(obj).slice(0, 300));
  return rawText ? { message: flattenMarkdown(stripTrailingSchemaEcho(rawText)) } : null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = (locals as any).runtime?.env ?? {};

  // --- Parse con guarda de tamaño ANTES de JSON.parse ---
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { ok: false, error: 'invalid_request' });
  }
  if (!raw || raw.length > MAX_BODY_CHARS) {
    return json(400, { ok: false, error: 'invalid_request' });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: 'invalid_request' });
  }

  const locale = body?.locale;
  const message = body?.message;
  const history = body?.history ?? [];
  // V2: el cliente marca leadSent=true una vez que un lead ya se envió en
  // esta conversación (ver ChatbotWidget.astro) — evita reenviar el mismo
  // correo si el visitante sigue chateando después del momento de
  // conversión y el modelo vuelve a incluir "lead" en un turno posterior.
  const leadAlreadySent = body?.leadSent === true;

  if (!isValidLocale(locale)) return json(400, { ok: false, error: 'invalid_request' });
  if (typeof message !== 'string') return json(400, { ok: false, error: 'invalid_request' });
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0 || trimmedMessage.length > MAX_MESSAGE_LEN) {
    return json(400, { ok: false, error: 'invalid_request' });
  }
  if (!isValidHistory(history)) return json(400, { ok: false, error: 'invalid_request' });

  // --- Rate limit: binding nativo de Cloudflare (obligatorio en V1) ---
  // CF-Connecting-IP: mismo header ya usado y confiado en src/pages/api/contact.ts
  // para Turnstile — lo pone el borde de Cloudflare, no lo puede falsear el cliente
  // en este despliegue. En local (wrangler dev) no está presente: se usa una clave
  // fija ("local-dev"), documentado en la spec aprobada — todo el tráfico local
  // comparte un único cubo, aceptable porque es tráfico de desarrollo, no público.
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local-dev';
  const rateLimiter = env.CHAT_RATE_LIMIT;
  if (!rateLimiter) {
    // El chatbot no debe operar sin protección contra abuso (requisito de V1) —
    // si falta el binding, se falla cerrado en vez de servir sin límite.
    console.error('Falta el binding nativo CHAT_RATE_LIMIT (Rate Limiting): no se puede aplicar el rate limit.');
    return json(503, { ok: false, error: 'unavailable' });
  }
  try {
    const { success } = await rateLimiter.limit({ key: ip });
    if (!success) {
      return json(
        429,
        { ok: false, error: 'rate_limited' },
        { 'Retry-After': String(RATE_LIMIT_PERIOD_SECONDS) },
      );
    }
  } catch (e) {
    console.error('El binding de Rate Limiting falló:', e);
    return json(503, { ok: false, error: 'unavailable' });
  }

  // --- Contexto + system prompt, generados desde el contenido aprobado ---
  let systemPrompt: string;
  try {
    const context = await buildChatContext(locale);
    systemPrompt = buildSystemPrompt(locale, context);
  } catch (e) {
    console.error('No se pudo construir el contexto del chatbot:', e);
    return json(503, { ok: false, error: 'unavailable' });
  }

  // --- Workers AI ---
  const ai = env.AI;
  if (!ai) {
    console.error('Falta el binding AI: Workers AI no está configurado.');
    return json(503, { ok: false, error: 'unavailable' });
  }
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: trimmedMessage },
  ];

  // Una llamada al modelo → respuesta ya parseada, o lanza. result.response
  // normalmente es un string, pero Workers AI a veces lo entrega ya como
  // objeto (y siempre en JSON Mode) — parseModelReply acepta ambas formas.
  const runModel = async (model: string, jsonMode: boolean): Promise<ParsedReply> => {
    const input: Record<string, unknown> = { messages, max_tokens: MAX_TOKENS };
    if (jsonMode) input.response_format = { type: 'json_schema', json_schema: REPLY_SCHEMA };
    const result = await ai.run(model, input);
    const reply = result?.response;
    const isEmptyString = typeof reply === 'string' && reply.trim().length === 0;
    if (reply === undefined || reply === null || isEmptyString) {
      throw new Error('Respuesta vacía del modelo.');
    }
    const parsedOrNull = parseModelReply(reply);
    if (!parsedOrNull) throw new Error('El modelo devolvió una respuesta sin forma utilizable.');
    return parsedOrNull;
  };

  let parsed: ParsedReply;
  try {
    parsed = await runModel(PRIMARY_MODEL, true);
  } catch (primaryError) {
    console.error('Chatbot: el modelo principal falló, usando el modelo de respaldo:', primaryError);
    try {
      parsed = await runModel(FALLBACK_MODEL, false);
    } catch (e) {
      console.error('Workers AI falló (también el respaldo):', e);
      return json(502, { ok: false, error: 'unavailable' });
    }
  }

  // --- Captura de lead (V2) — nunca debe romper la respuesta del chat ---
  // Solo se envía si el modelo trajo un "lead" en ESTE turno Y el cliente
  // no había marcado ya leadSent=true (evita reenvíos duplicados). Un fallo
  // de Resend aquí se registra y se ignora — ver sendChatLead, que ya nunca
  // lanza; el try/catch de aquí es una segunda capa de seguridad.
  let leadSent: boolean | undefined;
  if (parsed.lead && !leadAlreadySent) {
    try {
      await sendChatLead(env, locale, parsed.lead, [...history, { role: 'user', content: trimmedMessage }]);
    } catch (e) {
      console.error('Chatbot: sendChatLead falló inesperadamente (ignorado, no afecta la respuesta):', e);
    }
    // Copia al CRM de Alethig Media OS (→ HubSpot) solo si hay email o teléfono.
    const l = parsed.lead;
    if (l.email || l.phone) {
      await forwardLeadToOs(locals, {
        name: l.name, email: l.email, phone: l.phone, company: l.business, city: l.location,
        service: l.service_interest,
        message: [l.business_type && `Tipo de negocio: ${l.business_type}`, l.marketing_goal && `Objetivo: ${l.marketing_goal}`, `Idioma: ${locale}`].filter(Boolean).join('\n'),
        source_detail: 'chatbot',
      });
    }
    leadSent = true;
  }

  return json(200, {
    ok: true,
    reply: parsed.message,
    quickReplies: parsed.quickReplies,
    showContactActions: parsed.showContactActions,
    leadSent,
  });
};
