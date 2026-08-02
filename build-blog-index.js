#!/usr/bin/env node
/**
 * build-blog-index.js
 * ---------------------------------------------------------
 * Pensado para tu flujo: vos creás los artículos como archivos
 * .html directamente dentro de la carpeta /blog/ (por ejemplo con
 * la ayuda de Claude en VS Code), y este script:
 *
 *   1. Escanea todos los .html que haya dentro de /blog/
 *      (excepto blog/index.html, que es el que este script genera).
 *   2. Lee el <title>, la <meta name="description"> y la
 *      <meta name="date" content="AAAA-MM-DD"> de cada artículo.
 *   3. Genera /blog/index.html con la lista de todos los artículos,
 *      ordenados del más nuevo al más viejo.
 *   4. Actualiza /sitemap.xml con todas las páginas del sitio.
 *
 * Uso:
 *   node build-blog-index.js
 *
 * No hace falta instalar nada, solo tener Node.js.
 * Corré el script cada vez que agregues o edites un artículo.
 * ---------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

// ------------------------------------------------------------------
// CONFIGURACIÓN — cambiá esto por tu dominio real antes de publicar
// ------------------------------------------------------------------
const DOMAIN = 'https://www.gofrejuego.com';
const SITE_NAME = 'Gofre';

const ROOT = __dirname;
const BLOG_DIR = path.join(ROOT, 'blog');
const BLOG_INDEX_PATH = path.join(BLOG_DIR, 'index.html');
const SITEMAP_PATH = path.join(ROOT, 'sitemap.xml');

const STATIC_PAGES = [
  { loc: `${DOMAIN}/`, changefreq: 'daily', priority: '1.0' },
  { loc: `${DOMAIN}/como-jugar.html`, changefreq: 'monthly', priority: '0.8' },
  { loc: `${DOMAIN}/estrategias-para-ganar-en-gofre.html`, changefreq: 'monthly', priority: '0.8' },
  { loc: `${DOMAIN}/blog/`, changefreq: 'daily', priority: '0.9' },
  // privacidad.html y terminos.html llevan <meta name="robots" content="noindex">
  // a propósito, así que no se listan acá (son navegables pero no se indexan).
];

// ------------------------------------------------------------------
// Servicios de terceros: se cargan directamente, sin aviso visible al entrar.
// Se inyecta en <head> de cada página que genera este script, para que no
// se pierda si se vuelve a correr.
// ------------------------------------------------------------------
const HEAD_CONSENT_SNIPPET = `<script>
(function(){
  var s1 = document.createElement('script');
  s1.async = true;
  s1.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4766140355071916';
  s1.crossOrigin = 'anonymous';
  document.head.appendChild(s1);

  var s2 = document.createElement('script');
  s2.async = true;
  s2.src = 'https://www.googletagmanager.com/gtag/js?id=G-KZ7HHPBYB7';
  document.head.appendChild(s2);

  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', 'G-KZ7HHPBYB7');
})();
</script>
`;

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function humanDate(isoDate){
  const [y,m,d] = isoDate.split('-').map(Number);
  if(!y || !m || !d) return isoDate;
  return `${d} de ${MESES[m-1]} de ${y}`;
}

function todayISO(){
  return new Date().toISOString().slice(0,10);
}

function extractTag(html, regex, fallback){
  const m = html.match(regex);
  return m ? m[1].trim() : fallback;
}

function humanizeFilename(filename){
  const name = filename.replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Lee un artículo .html y saca sus metadatos para la tarjeta del blog.
function readArticle(filename){
  const filePath = path.join(BLOG_DIR, filename);
  const html = fs.readFileSync(filePath, 'utf8');

  const title = extractTag(html, /<title>([\s\S]*?)<\/title>/i, humanizeFilename(filename));
  const cleanTitle = title.replace(new RegExp(`\\s*[—-]\\s*Blog de ${SITE_NAME}\\s*$`, 'i'), '').trim();
  const description = extractTag(
    html,
    /<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?>/i,
    ''
  );
  let date = extractTag(
    html,
    /<meta\s+name=["']date["']\s+content=["'](\d{4}-\d{2}-\d{2})["']\s*\/?>/i,
    null
  );

  let dateSource = 'meta';
  if(!date){
    date = fs.statSync(filePath).mtime.toISOString().slice(0,10);
    dateSource = 'archivo (sin <meta name="date">)';
  }

  return { filename, title: cleanTitle, description, date, dateSource };
}

// ------------------------------------------------------------------
// Generación del índice del blog
// ------------------------------------------------------------------

function baseStyles(){
  return `
  :root{
    --bg:#1B1712; --surface:#251F17; --tile:#332B20; --tile-border:#493D2B;
    --ink:#F4ECDC; --ink-dim:#B4A48C; --ink-faint:#7A6E5B;
    --accent:#ED8A3F; --accent-ink:#241207;
  }
  *{box-sizing:border-box;}
  body{
    margin:0; min-height:100vh;
    background:
      radial-gradient(circle at 20% -10%, rgba(237,138,63,.08), transparent 45%),
      radial-gradient(circle at 100% 10%, rgba(237,138,63,.05), transparent 40%),
      var(--bg);
    color:var(--ink); font-family:'Space Grotesk', sans-serif;
    padding:32px 18px 60px;
  }
  main{ max-width:640px; margin:0 auto; }
  a{ color:var(--accent); }
  header.page-head{ text-align:center; margin-bottom:28px; display:flex; flex-direction:column; align-items:center; gap:6px; }
  .brand{ display:flex; align-items:baseline; gap:10px; }
  .brand .dot{ width:9px;height:9px;border-radius:50%; background:var(--accent); box-shadow:0 0 12px rgba(237,138,63,.7); }
  .brand span.name{ font-family:'Fraunces', serif; font-weight:700; font-style:italic; font-size:1.6rem; }
  h1{ font-family:'Fraunces', serif; font-weight:700; font-size:1.75rem; line-height:1.25; margin:6px 0 4px; }
  .subtitle{ color:var(--ink-faint); font-size:.9rem; }
  nav.sitenav{ display:flex; gap:16px; justify-content:center; flex-wrap:wrap; font-size:.8rem; margin-top:14px; }
  nav.sitenav a{ text-decoration:none; color:var(--ink-dim); border-bottom:1px solid transparent; }
  nav.sitenav a:hover{ color:var(--accent); border-color:var(--accent); }
  .post-list{ display:flex; flex-direction:column; gap:14px; }
  .post-card{ display:block; background:var(--surface); border:1px solid var(--tile-border); border-radius:14px; padding:18px 20px; text-decoration:none; transition:border-color .2s ease; }
  .post-card:hover{ border-color:var(--accent); }
  .post-card .post-date{ color:var(--ink-faint); font-size:.72rem; text-transform:uppercase; letter-spacing:.04em; }
  .post-card h2{ font-family:'Fraunces', serif; font-size:1.1rem; color:var(--ink); margin:6px 0 6px; }
  .post-card p{ color:var(--ink-dim); font-size:.85rem; margin:0; line-height:1.5; }
  .empty-state{ text-align:center; color:var(--ink-faint); font-size:.9rem; padding:30px 0; }
  footer{ text-align:center; color:var(--ink-faint); font-size:.76rem; margin-top:30px; }
  footer a{ color:var(--ink-faint); }
  `;
}

function renderBlogIndex(articles){
  const sorted = [...articles].sort((a,b)=> b.date.localeCompare(a.date));
  const canonical = `${DOMAIN}/blog/`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": `Blog de ${SITE_NAME}`,
    "description": `Artículos, consejos y estrategias sobre ${SITE_NAME}, el juego de palabras en español.`,
    "url": canonical,
    "inLanguage": "es"
  };

  const listHtml = sorted.length
    ? `<div class="post-list">${sorted.map(a=>`
      <a class="post-card" href="${a.filename}">
        <div class="post-date">${humanDate(a.date)}</div>
        <h2>${a.title}</h2>
        <p>${a.description}</p>
      </a>`).join('')}</div>`
    : `<p class="empty-state">Todavía no hay artículos publicados. ¡El primero está en camino!</p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
${HEAD_CONSENT_SNIPPET}
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Blog de ${SITE_NAME} — consejos, novedades y estrategias</title>
<meta name="description" content="Artículos sobre ${SITE_NAME}: estrategias, vocabulario y novedades del juego de palabras en español estilo Waffle.">
<meta name="keywords" content="blog waffle en español, consejos wordle, vocabulario en español, juego de palabras">
<link rel="canonical" href="${canonical}">

<meta property="og:type" content="website">
<meta property="og:title" content="Blog de ${SITE_NAME}">
<meta property="og:description" content="Artículos sobre ${SITE_NAME}: estrategias, vocabulario y novedades del juego.">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="es_ES">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">

<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2)}
</script>
<style>${baseStyles()}</style>
</head>
<body>
<main>
  <header class="page-head">
    <div class="brand"><span class="dot"></span><span class="name">${SITE_NAME}</span></div>
    <h1>Blog de ${SITE_NAME}</h1>
    <p class="subtitle">Estrategias, vocabulario y novedades sobre el juego</p>
    <nav class="sitenav" aria-label="Navegación del sitio">
      <a href="../index.html">Jugar</a>
      <a href="../como-jugar.html">Cómo se juega</a>
    </nav>
  </header>

  ${listHtml}

  <footer>
    <p><a href="../index.html">${SITE_NAME}</a> — juego de palabras gratuito en español · <a href="../privacidad.html">Privacidad</a> · <a href="../terminos.html">Términos</a></p>
  </footer>
</main>
</body>
</html>
`;
}

function renderSitemap(articles){
  const articleEntries = articles.map(a=>({
    loc: `${DOMAIN}/blog/${a.filename}`,
    changefreq: 'monthly',
    priority: '0.6',
    lastmod: a.date
  }));

  const entries = [
    ...STATIC_PAGES.map(p=>({ ...p, lastmod: todayISO() })),
    ...articleEntries
  ];

  const body = entries.map(e=>`  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

// ------------------------------------------------------------------
// Proceso principal
// ------------------------------------------------------------------

function main(){
  if(!fs.existsSync(BLOG_DIR)){
    fs.mkdirSync(BLOG_DIR, { recursive: true });
    console.log('Creé la carpeta blog/ — poné ahí tus artículos .html y volvé a correr el script.');
    return;
  }

  const files = fs.readdirSync(BLOG_DIR).filter(f=>{
    return f.toLowerCase().endsWith('.html') && f.toLowerCase() !== 'index.html';
  });

  if(!files.length){
    console.log('No encontré artículos en blog/ (solo se cuentan archivos .html, sin contar index.html).');
  }

  const articles = files.map(readArticle);

  articles.forEach(a=>{
    if(a.dateSource !== 'meta'){
      console.log(`ℹ️  "${a.filename}" no tiene <meta name="date" content="AAAA-MM-DD">, usé la fecha del archivo (${a.date}). Agregá esa etiqueta para controlar el orden vos mismo.`);
    }
  });

  fs.writeFileSync(BLOG_INDEX_PATH, renderBlogIndex(articles), 'utf8');
  console.log(`✓ blog/index.html actualizado con ${articles.length} artículo(s):`);
  articles
    .sort((a,b)=> b.date.localeCompare(a.date))
    .forEach(a=> console.log(`   - [${a.date}] ${a.title}  (blog/${a.filename})`));

  fs.writeFileSync(SITEMAP_PATH, renderSitemap(articles), 'utf8');
  console.log('✓ sitemap.xml actualizado');

  console.log('\nListo. Subí blog/index.html, sitemap.xml y los artículos nuevos/editados a tu hosting.');
}

main();