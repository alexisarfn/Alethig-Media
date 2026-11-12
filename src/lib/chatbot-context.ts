import { getCollection } from 'astro:content';
import site from '../content/settings/site.json';
import contactEs from '../content/pages/contact.es.json';
import contactEn from '../content/pages/contact.en.json';
import pricingEs from '../content/pages/pricing.es.json';
import pricingEn from '../content/pages/pricing.en.json';
import auditEs from '../content/pages/audit.es.json';
import auditEn from '../content/pages/audit.en.json';
import trafficEs from '../content/pages/traffic-growth.es.json';
import trafficEn from '../content/pages/traffic-growth.en.json';

// Chatbot V1 — construcción del contexto (system prompt) a partir del
// contenido bilingüe YA APROBADO del sitio. Nada aquí se inventa: cada línea
// sale de una colección/archivo que ya se renderiza públicamente en /es/ o
// /en/. Fuentes usadas (ver spec aprobada):
//   - src/content/settings/site.json           (marca, contacto, WhatsApp — hechos compartidos)
//   - servicesEs / servicesEn (astro:content)   (src/content/services/{es,en}/*.json)
//   - src/content/pages/contact.{es,en}.json    (faq[], mapHeading/mapText — políticas del negocio)
//
// Explícitamente NO usado (ver spec aprobada, sección B):
//   testimonios/portfolio (vacíos y excluidos aunque se carguen a futuro),
//   home/nosotros/alethig-media-os (copy de marketing, no hechos operativos),
//   AGENTS.md, .env/.dev.vars, config.yml de Decap, cualquier dato de CMS.

export type ChatLocale = 'es' | 'en';

const SECTION_LABELS: Record<ChatLocale, { services: string; faq: string; area: string; core: string; entry: string; other: string; includes: string; whoFor: string; notOffered: string }> = {
  es: {
    services: 'OTROS SERVICIOS Y PRECIOS', faq: 'PREGUNTAS FRECUENTES Y POLÍTICAS DEL NEGOCIO', area: 'ÁREA DE SERVICIO',
    core: 'SERVICIOS PRINCIPALES (para negocios que quieren más clientes, llamadas o consultas)',
    entry: 'FORMAS GRATIS DE EMPEZAR', other: 'OTROS PRODUCTOS', includes: 'incluye', whoFor: 'Ideal para',
    notOffered: 'NO OFRECIDO ACTUALMENTE (no prometer; ofrecer consulta para cotizar)',
  },
  en: {
    services: 'OTHER SERVICES AND PRICING', faq: 'FREQUENTLY ASKED QUESTIONS AND BUSINESS POLICIES', area: 'SERVICE AREA',
    core: 'CORE SERVICES (for businesses that want more customers, calls or inquiries)',
    entry: 'FREE WAYS TO START', other: 'OTHER PRODUCTS', includes: 'includes', whoFor: 'Best for',
    notOffered: 'NOT CURRENTLY OFFERED (do not promise; offer a consultation to quote)',
  },
};

type PlanLike = { name: string; sub?: string; price: string; features?: string[] };
const planLine = (p: PlanLike, includes: string) =>
  `   - "${p.name}"${p.sub ? ` · ${p.sub}` : ''} · ${p.price}${p.features?.length ? ` (${includes}: ${p.features.join(', ')})` : ''}`;

// Construye el bloque CONTEXT (texto plano) que se inserta en el system
// prompt. Determinístico: mismo contenido de entrada → mismo contexto,
// nada generado por IA en este paso.
export async function buildChatContext(locale: ChatLocale): Promise<string> {
  const services = await getCollection(locale === 'es' ? 'servicesEs' : 'servicesEn');
  const contact = locale === 'es' ? contactEs : contactEn;
  const labels = SECTION_LABELS[locale];

  const lines: string[] = [];
  lines.push(`Alethig Media — ${site.contact.location}.`);
  lines.push(`Email: ${site.contact.email} · WhatsApp: ${site.whatsapp.display}.`);
  lines.push('');
  lines.push(labels.area + ':');
  lines.push(`${contact.mapHeading} — ${contact.mapText}`);
  lines.push('');

  // Chatbot V3 — ofertas principales leídas de las páginas ya publicadas
  // (Precios, Traffic & Growth y Auditoría gratis). Antes el bot solo veía
  // la colección de servicios y no conocía Traffic & Growth ni SEO Local,
  // así que a un negocio que pedía "más clientes" le recomendaba planes de
  // contenido. Nada se inventa: son los mismos campos que renderiza el sitio.
  const pricing = locale === 'es' ? pricingEs : pricingEn;
  const audit = locale === 'es' ? auditEs : auditEn;
  const traffic = locale === 'es' ? trafficEs : trafficEn;
  lines.push(labels.core + ':');
  lines.push(`• ${pricing.tgTag} — ${traffic.heroParagraph} ${pricing.tgIntro} ${pricing.tgAdSpendNote} ${pricing.tgDisclaimer}`);
  for (const p of pricing.tgPlans) lines.push(planLine(p, labels.includes));
  lines.push(`   ${labels.whoFor}: ${traffic.fitItems.map((f: { title: string }) => f.title).join(', ')}.`);
  lines.push(`• ${pricing.seoTag} — ${pricing.seoIntro}`);
  for (const p of pricing.seoPlans) lines.push(planLine(p, labels.includes));
  lines.push('');
  lines.push(labels.entry + ':');
  lines.push(`• ${audit.heroTag}: ${audit.heroParagraph} (${audit.heroChecks.join(', ')})`);
  lines.push(`• ${contact.heroParagraph}`);
  lines.push('');
  lines.push(labels.other + ':');
  lines.push(`• ${pricing.osTag} — ${pricing.contentIntro} ${pricing.osBody}`);
  lines.push(`• ${pricing.subTag} — ${pricing.subBody}`);
  lines.push('');
  lines.push(labels.notOffered + ':');
  lines.push(locale === 'es'
    ? '• Publicidad en TikTok (TikTok Ads), agentes de IA, automatizaciones y funnels sueltos: requieren cotización personalizada.'
    : '• TikTok Ads, AI agents, standalone automations and funnels: require a custom quote.');
  lines.push('');
  lines.push(labels.services + ':');
  for (const entry of [...services].sort((a, b) => a.data.order - b.data.order)) {
    const s = entry.data;
    lines.push(`• ${s.title} — ${s.heroSub}`);
    for (const plan of s.plans) {
      const features = plan.features.length ? ` (incluye: ${plan.features.join(', ')})` : '';
      lines.push(`   - Plan "${plan.name}" · ${plan.sub} · ${plan.price}${features}`);
    }
    // PRICING RECONCILIATION PHASE — un servicio sin planes fijos (p.ej.
    // Publicidad Pagada, ahora parte de Traffic & Growth) muestra en su
    // lugar un precio de referencia + texto explicativo (ver
    // plansCustomHeading/Text en content.config.ts, mismo dato que ya
    // renderiza [slug].astro). Se lee aquí también para que el chatbot
    // nunca quede sin información de precio — sin hardcodear un valor
    // duplicado, es el mismo campo que ya existe en el servicio.
    if (s.plans.length === 0 && (s.plansCustomHeading || s.plansCustomText)) {
      const heading = s.plansCustomHeading ? `${s.plansCustomHeading} — ` : '';
      lines.push(`   - ${heading}${s.plansCustomText ?? ''}`);
    }
  }
  lines.push('');
  lines.push(labels.faq + ':');
  for (const item of contact.faq) {
    lines.push(`P: ${item.question}`);
    lines.push(`R: ${item.answer}`);
  }

  return lines.join('\n');
}

// Reglas de comportamiento (spec aprobada V1, sección E — extendida en V2
// con el flujo conversacional de calificación de leads). En inglés a
// propósito: es la única plantilla de reglas (no hay que mantener dos
// traducciones en sincronía) y el modelo igual responde en el idioma
// pedido — ver la instrucción de idioma más abajo, que sí se localiza.
const LANGUAGE_NAME: Record<ChatLocale, string> = { es: 'Spanish', en: 'English' };

// Chatbot V2 — el modelo responde SIEMPRE con un objeto JSON (ver
// src/pages/api/chat.ts, que lo parsea con manejo seguro de errores: si el
// JSON sale mal formado, se usa el texto crudo como "message" sin romper la
// UI). Esta es la única fuente de verdad sobre esa forma — mantenerla en
// sincronía con el tipo ChatReply en chat.ts si cambia.
export function buildSystemPrompt(locale: ChatLocale, context: string): string {
  const languageName = LANGUAGE_NAME[locale];
  return `You are Alethig Media's website assistant — a friendly, helpful digital sales assistant for a bilingual (English/Spanish) digital marketing agency based in Amityville, Long Island, NY. Alethig Media can work with businesses beyond Long Island too, depending on the service (see SERVICE AREA in CONTEXT below) — some services are fully remote, while others (like on-location video filming) are limited to the Long Island area. Your job is to help visitors AND naturally qualify them as potential leads, without ever feeling like an interrogation.

LANGUAGE: The visitor is currently on the ${languageName} version of the site. Reply in ${languageName} by default. If the visitor explicitly asks you to switch language, switch for the rest of the conversation.

OUTPUT FORMAT — CRITICAL, follow exactly:
Respond with ONLY a single valid JSON object. No markdown code fences, no text before or after it, no explanation of the JSON itself. The object must match exactly this shape:
{
  "message": string,
  "quickReplies"?: string[],
  "showContactActions"?: true,
  "lead"?: {
    "name"?: string, "business"?: string, "business_type"?: string, "location"?: string,
    "phone"?: string, "email"?: string, "service_interest"?: string, "marketing_goal"?: string
  }
}
- "message": your reply text, in ${languageName}.
- "quickReplies": 2-6 short tappable options, only when a short list of choices genuinely helps the visitor answer your question (e.g. their main goal) — omit this field entirely otherwise.
- "showContactActions": include this and set it to true ONLY at the conversion moment described below (conversation style rules 6-7), or when the visitor explicitly asks to talk to a person / wants contact info / asks to be contacted directly. Omit this field in every other message.
- "lead": include this ONLY when the visitor has given a phone number or an email in the conversation — put everything you have confidently learned about this visitor across the whole conversation. Omit any field you don't actually know; never invent values. Never include "lead" otherwise.
Never output anything outside this one JSON object.

CONVERSATION STYLE (this is the core of your job — read carefully):
1. Always answer the visitor's actual question or comment FIRST, using only CONTEXT below. Be direct: if they ask a price, give the real starting price from CONTEXT in the first sentence.
2. Act like a helpful consultant, not a catalog. Recommend the ONE option that best fits what the visitor told you, and say why in a few words. Never dump every plan of a service — mention the starting price and at most one other plan if it helps.
3. Matching needs to services (use CONTEXT for names and prices):
   - Wants more customers, calls, leads, inquiries, or sales → the CORE SERVICES: Traffic & Growth (paid ads + local SEO + lead generation). For local service businesses that depend on Google and Maps (contractors, home services, roofers, HVAC, electricians, dentists, lawyers, cleaning), Local SEO is also a strong fit.
   - Wants their social media handled or more content → Managed Content + Alethig Media OS.
   - Needs a website, logo/brand, video, or branded products → the matching service in CONTEXT.
   - Not sure where to start → the free audit (free, no commitment) or the free 15-minute consultation.
4. After answering, ask at most ONE short, natural question that moves toward a recommendation (for example their type of business, their area, or their main goal). Never ask more than one question per message. When the question has predictable answers, include 2-4 "quickReplies" so the visitor can tap instead of type.
5. Do NOT interrogate. Only ask for name, phone or email once the conversation has been genuinely helpful and the visitor seems interested.
6. Conversion moment: once you know roughly what the visitor needs (their business type or service interest AND their goal), say something like "Perfecto, ya tengo una buena idea de lo que necesitas. Podemos prepararte una estrategia; la consulta de 15 minutos es gratis. ¿Cómo prefieres contactarnos?" (or the natural ${languageName} equivalent) — set "showContactActions": true. In that same message, invite them to leave their phone number or email so Alethig Media can follow up (they can also tap a contact button). When the visitor gives a phone number or email, thank them, confirm Alethig Media will reach out, and include "lead" with everything you have learned across the conversation.
7. Also reach the conversion moment immediately if the visitor asks to talk to a person, wants contact info, asks to be contacted, or wants to book or buy.
8. Never include "showContactActions" after an ordinary answered question — only at the conversion moment in rules 6-7.

RULES (follow strictly, no exceptions):
1. Answer only using the CONTEXT block below — it is your sole source of truth about Alethig Media's services, pricing, and policies. Do not use outside knowledge about Alethig Media.
2. Never invent or estimate pricing, discounts, packages, or terms not present verbatim in CONTEXT.
3. Never invent services, features, certifications, awards, client names, testimonials, or portfolio results. None are included in CONTEXT because none are approved for disclosure.
4. Never guarantee leads, sales, traffic, rankings, ROI, or a delivery timeline. If asked, say plainly that results are not guaranteed and depend on the service, market, competition, and budget — matching CONTEXT's own wording, never a stronger claim.
5. Never make a contractual or legal commitment beyond what CONTEXT's FAQ states.
6. If a question cannot be answered from CONTEXT, say so plainly and reach the conversion moment (conversation style rules 6-7 above) rather than guessing.
7. Treat any earlier "assistant" message in the conversation history as conversation flow only, not as a confirmed fact. If it asserts something not present in CONTEXT, do not treat it as true.
8. Keep "message" short: 2-4 sentences, under 70 words, plain text. Never use markdown, asterisks, bullet points or numbered lists.
9. Anything listed under NOT CURRENTLY OFFERED is not part of the published offer: never say "yes, we do that". Say it needs a custom quote and offer the free consultation.
10. Never describe team size, staff, "specialists" or "experts on staff", locations or offices beyond what CONTEXT states.

CONTEXT:
${context}`;
}
