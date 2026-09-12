import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Servicios con layout uniforme (features + planes). Las páginas bespoke
// (agentes-ia, embudos-venta, creadores-ugc) son páginas propias y NO van aquí.
//
// Contenido bilingüe: cada idioma vive en su propia carpeta
// (src/content/services/es/, src/content/services/en/), una colección
// por idioma, mismo esquema. El id de la colección (nombre de archivo)
// se mantiene igual entre idiomas a propósito — así se puede emparejar
// un servicio ES con su equivalente EN por id, sin depender de la URL.
//
// urlSlug: solo lo usa el inglés. La URL pública en inglés
// (/en/services/<urlSlug>) es distinta del id/nombre de archivo
// (que se conserva en español, p.ej. "desarrollo-web", para el
// emparejamiento); en español la URL pública SÍ es el id directamente,
// por eso el campo queda opcional y sin uso ahí.
const serviceSchema = z.object({
  title: z.string(),
  urlSlug: z.string().optional(),
  metaDescription: z.string(),
  order: z.number(),
  icon: z.string(),
  heroHeading: z.string(),
  heroHighlight: z.string(),
  heroSub: z.string(),
  heroCtaLabel: z.string(),
  // POSITIONING PHASE 9.5 — override opcional del CTA secundario del hero
  // (por defecto "Ver planes" → #planes, ver [slug].astro). Un servicio sin
  // planes públicos (p.ej. Contenido para Redes Sociales, movido a un
  // modelo gestionado por Alethig Media OS) puede apuntar este botón a otro
  // lugar (p.ej. la página de Alethig Media OS) en vez del ancla de planes.
  heroCtaSecondaryLabel: z.string().optional(),
  heroCtaSecondaryHref: z.string().optional(),
  image: z.string(),
  imageAlt: z.string(),
  features: z.array(z.object({ icon: z.string(), title: z.string(), desc: z.string() })),
  plans: z.array(z.object({
    name: z.string(), sub: z.string(), price: z.string(), featured: z.boolean(),
    features: z.array(z.string()),
    // Clave de grupo opcional (p.ej. "package"/"individual") para separar
    // visualmente un paquete principal de ítems sueltos — ver planGroups.
    // Sin esto, todos los planes se renderizan en una sola grilla (como hoy).
    group: z.string().optional(),
  })),
  // POSITIONING PHASE 9.5 — cuando `plans` está vacío (servicio sin precio
  // público todavía, p.ej. Contenido para Redes Sociales bajo el nuevo
  // modelo gestionado por Alethig Media OS), la sección "Planes" deja de
  // renderizar una grilla vacía y en su lugar muestra este texto breve +
  // el mismo CTA de consulta del hero. Ambos opcionales: un servicio con
  // `plans` no vacío nunca los necesita y la plantilla no los usa.
  plansCustomHeading: z.string().optional(),
  plansCustomText: z.string().optional(),
  // Grupos visuales opcionales para la sección de precios (P2C-1). Si está
  // presente, la plantilla agrupa `plans` por su campo `group` bajo cada
  // título; si no está, renderiza la grilla plana de siempre. 100%
  // data-driven: ningún servicio necesita lógica especial en la plantilla.
  planGroups: z.array(z.object({ key: z.string(), label: z.string() })).optional(),
  // Reemplaza el titular genérico "Planes y precios"/"Plans and pricing"
  // cuando el encuadre de precios de un servicio necesita ser más específico
  // (p.ej. "Elige tu canal de publicidad"). Opcional; sin esto, el titular
  // genérico se mantiene igual que antes.
  plansHeading: z.string().optional(),
  ctaHeading: z.string(),
  ctaText: z.string(),
  ctaButtonLabel: z.string(),
  ctaButtonIcon: z.string(),
});

const servicesEs = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/services/es' }),
  schema: serviceSchema,
});

// Registrada para que el contenido en inglés se valide en cada build
// (npm run build revisa su esquema aunque ninguna página la use todavía).
// Las rutas /en/ que la consuman llegan en una fase aparte.
const servicesEn = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/services/en' }),
  schema: serviceSchema,
});

// Testimonios (P2C-2a — solo infraestructura, sin contenido real ni de
// prueba todavía). Mismo patrón bilingüe que los servicios: una carpeta
// por idioma, mismo esquema, ambas colecciones arrancan vacías (solo un
// .gitkeep, sin JSON) — getCollection() sobre una carpeta vacía devuelve
// un array vacío, no un error, así que el build valida igual sin contenido.
//
// `published` por defecto es false a propósito: un testimonio cargado en
// el CMS nunca aparece en el sitio hasta que alguien lo marque publicado
// explícitamente — evita que un borrador se publique por accidente.
const testimonialSchema = z.object({
  clientName: z.string(),
  businessName: z.string().optional(),
  quote: z.string(),
  rating: z.number().min(1).max(5).optional(),
  photo: z.string().optional(),
  // id de la colección de servicios (p.ej. "desarrollo-web" en ES,
  // "web-development" en EN) — mismo valor que ya usa cada plantilla de
  // servicio para engancharse a un enlace, sin acoplar el esquema a esa
  // colección.
  relatedService: z.string().optional(),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
});

const testimonialsEs = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/testimonials/es' }),
  schema: testimonialSchema,
});
const testimonialsEn = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/testimonials/en' }),
  schema: testimonialSchema,
});

// Portfolio / Trabajos seleccionados (P2C-2b — solo infraestructura, sin
// proyectos reales ni de prueba todavía). Mismo patrón bilingüe que
// servicios/testimonios: una carpeta por idioma, mismo esquema, ambas
// colecciones arrancan vacías (solo un .gitkeep, sin JSON).
//
// Publicación en dos pasos, ambos por defecto en false: `published` (el
// dueño del sitio decide mostrarlo) Y `clientConsent` (el cliente dio
// permiso explícito para aparecer). La plantilla pública solo debe
// renderizar un proyecto cuando AMBOS son true — ver es/index.astro y
// en/index.astro.
//
// Los campos de alt van en el esquema (heroImageAlt, y `alt` dentro de
// cada item de galleryImages) para que la plantilla nunca tenga que
// inventar un texto alternativo — si falta, se usa `title` como
// respaldo razonable (no un texto inventado, es contenido real ya
// provisto), nunca una descripción adivinada de la imagen.
const portfolioSchema = z.object({
  title: z.string(),
  category: z.string(),
  summary: z.string(),
  clientName: z.string().optional(),
  // id de la colección de servicios (mismo valor que ya usan
  // testimonios), sin acoplar el esquema a esa colección.
  relatedService: z.string().optional(),
  heroImage: z.string().optional(),
  heroImageAlt: z.string().optional(),
  galleryImages: z.array(z.object({
    image: z.string(),
    alt: z.string(),
  })).optional(),
  projectUrl: z.string().optional(),
  outcome: z.string().optional(),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
  clientConsent: z.boolean().default(false),
});

const portfolioEs = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/portfolio/es' }),
  schema: portfolioSchema,
});
const portfolioEn = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/portfolio/en' }),
  schema: portfolioSchema,
});

export const collections = {
  servicesEs, servicesEn,
  testimonialsEs, testimonialsEn,
  portfolioEs, portfolioEn,
};
