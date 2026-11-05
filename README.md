# Alethig Media — Sitio web

Sitio web de **Alethig Media**, agencia de marketing digital de Long Island, NY. Estética navy & gold sobre glassmorphism: manejo de redes, producción de video, publicidad pagada, diseño de marca y desarrollo web — bilingüe inglés y español.

## Stack

- **[Astro](https://astro.build)** v5 — Static site generator
- **[Tailwind CSS](https://tailwindcss.com)** v3 — Utility-first CSS
- **[PostCSS](https://postcss.org)** + Autoprefixer
- **[Cloudflare Pages](https://pages.cloudflare.com)** — Hosting
- **Nord + Montserrat** — Tipografías de marca (Nord auto-alojada, Montserrat vía Google Fonts)
- **Material Symbols** — Iconografía

## Marca

Paleta oficial (manual de identidad):

- Navy `#000326` (PANTONE 296 C) — fondo
- Dorado `#D8A62A` (PANTONE 2007 C) — acento
- Tipografía corporativa **Nord** (titulares) + secundaria **Montserrat** (cuerpo)

Detalles visuales:

- Fondo void navy con mesh gradients azul profundo + destellos dorados
- Tarjetas de cristal: `backdrop-filter: blur(20px) saturate(180%)`
- Logo imagotipo (`/logo.svg`), favicon isotipo (`/favicon.svg`)
- Micro-interacciones: magnetic buttons, reveal/stagger-fade en scroll, float animations

## Empezar

```bash
npm install
npm run dev       # → localhost:4321
npm run build     # → dist/
npm run preview
```

## Personalizar la marca — un solo archivo

Toda la marca (colores, tipografías y logo) vive en **`src/config/theme.mjs`**. Es lo único que se edita para rebrandear; de ahí se alimentan Tailwind, el CSS de los componentes (glass, glow, gradientes), el `<link>` de Google Fonts y el logo. **No toques el markup ni `global.css`.**

```js
// src/config/theme.mjs
export const colors = {
  accent: '#D8A62A', 'accent-2': '#E9C46A',
  'bg-void': '#000326', 'bg-depth': '#060A33',
  'grad-indigo': '#1B2A6B', 'grad-violet': '#8C6A12', 'grad-pink': '#E9C46A',
  'text-primary': '#F5F1E6', 'text-secondary': '#A7AEC9', 'text-dim': '#5C638A',
};
export const fonts = {
  display: 'Nord, sans-serif',
  body: 'Montserrat, sans-serif',
  googleHref: 'https://fonts.googleapis.com/css2?family=Montserrat:…',
};
export const logo = { image: '/logo.svg', icon: 'bolt', alt: 'Alethig Media' };
```

> Nord se auto-aloja vía `@font-face` en `global.css` (archivos en `public/fonts/`). Los derivados del acento (rgb, glow, dim, borde glass) se calculan solos a partir de `accent`.

## Contenido — fuente de verdad

El contenido (textos, precios, nombres) proviene del documento **`Alethig_Media_Textos_Web_v2.md`**. Si algo no está en ese documento, no va en el sitio. El catálogo es material de referencia, no se usa para sobrescribir el sitio.

## Gestión de contenido (Decap CMS)

Todo el contenido es editable desde **`/admin`** sin tocar código. Vive como JSON en `src/content/` y Astro lo lee en build.

- `src/content/settings/site.json` — marca, nav, footer, contacto, redes sociales
- `src/content/pages/{home,about,contact}.json` — páginas comunes
- `src/content/services/*.json` — 5 servicios (features + planes), vía ruta dinámica `[slug]`

**Editar en local:** `npm run dev` + `npm run cms` → `http://localhost:4321/admin/index.html`.
**En producción:** desplegar `oauth-worker/` y poner su URL en `public/admin/config.yml` (ver [`oauth-worker/README.md`](oauth-worker/README.md)).

> El resaltado en gradiente de los titulares se controla con el campo **"Palabra resaltada"** (debe coincidir con una subcadena exacta del titular).

## Servicios (5 páginas)

| Ruta | Servicio | Desde |
|---|---|---|
| `/servicios/manejo-de-redes-sociales` | Manejo de Redes Sociales | $199/mes |
| `/servicios/produccion-de-video` | Producción de Video | $75/video |
| `/servicios/publicidad-pagada` | Publicidad Pagada | $99/campaña |
| `/servicios/diseno-de-marca` | Diseño de Marca | $429 |
| `/servicios/desarrollo-web` | Desarrollo Web | $499 |

## Contacto

- **Email:** alexisfuel93@gmail.com
- **Ubicación:** Amityville, Long Island, NY (Nassau + Suffolk)
- **Redes:** Instagram · Facebook · TikTok (`@alethig.media`)

## Deploy

```bash
git push  # → Cloudflare Pages build automático
```

