// src/components/article/article-css.ts
//
// One stylesheet for how an article reads: the public page, the admin preview and the writer's canvas all use it, so what is typed is what is
// published. Plain CSS with @media (Tailwind responsive classes are unreliable under Turbopack). One font: Red Hat Display via the next/font variable.

export const ARTICLE_CSS = `
.article-body{font-family:var(--font-redhat),system-ui,sans-serif;font-size:17px;line-height:1.7;color:#1A1A1A}
.article-body p{margin:0 0 1.3em}
.article-body h1{font-weight:800;font-size:32px;margin:1.4em 0 .5em;letter-spacing:-.01em}
.article-body h2{font-weight:800;font-size:26px;margin:1.6em 0 .6em;letter-spacing:-.01em}
.article-body h3{font-weight:700;font-size:20px;margin:1.4em 0 .5em}
.article-body ul,.article-body ol{margin:0 0 1.3em 1.4em}
.article-body li{margin-bottom:.4em}
.article-body blockquote{border-left:3px solid #FF5722;padding-left:16px;margin:1.6em 0;opacity:.9}
.article-body a{color:#FF5722;text-decoration:underline;text-underline-offset:2px}
.article-body hr{border:0;border-top:1px solid #e7e2d8;margin:2.2em 0}
.article-body code{background:#f1eee6;padding:1px 5px;border-radius:4px;font-size:.92em}
.article-body img{max-width:100%;height:auto}
.article-body figure{margin:1.8em 0}
.article-body figure img{display:block;width:100%;border-radius:10px}
.article-body figure.ar img{object-fit:cover}
.article-body figcaption,.ab-cap{font-size:13px;line-height:1.45;color:#8a8275;margin-top:8px}
.article-body figcaption b{color:#5b5347;font-weight:700}
.article-body figure.w-inline{max-width:560px;margin-left:auto;margin-right:auto}
.article-body figure.w-full img{border-radius:0}
.article-body .pull{border-left:4px solid #FF5722;padding:4px 0 4px 18px;margin:1.8em 0;font-size:24px;font-weight:800;letter-spacing:-.01em;line-height:1.3}
.article-body .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:1.8em 0}
.article-body .stats div{background:#f1eee6;border-radius:12px;padding:14px 12px;text-align:center}
.article-body .stats b{display:block;font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.1}
.article-body .stats span{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#5b5347;margin-top:4px}
.article-body .stats small{display:block;font-size:11.5px;color:#8a8275;margin-top:2px}
.article-body .pcard{display:flex;gap:14px;align-items:center;border:1px solid #e7e2d8;border-radius:14px;padding:12px 16px;background:#fff;margin:1.8em 0;text-decoration:none;color:inherit}
.article-body .pcard img{width:64px;height:64px;object-fit:contain;object-position:center bottom;flex:none}
.article-body .pcard b{display:block;font-size:17px;font-weight:800}
.article-body .pcard span{font-size:13px;color:#5b5347}
.article-body .tbl-wrap{overflow-x:auto;margin:1.8em 0;border:1px solid #e7e2d8;border-radius:12px}
.article-body table{border-collapse:collapse;width:100%;font-size:15px;font-variant-numeric:tabular-nums}
.article-body th{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8a8275;text-align:left;padding:9px 12px;border-bottom:1px solid #e7e2d8;background:#faf8f3}
.article-body td{padding:9px 12px;border-bottom:1px solid #f1eee6}
.article-body tr:last-child td{border-bottom:0}
.article-body .gallery{display:grid;gap:8px;margin:1.8em 0}
.article-body .gallery.n2{grid-template-columns:1fr 1fr}.article-body .gallery.n3{grid-template-columns:1fr 1fr 1fr}.article-body .gallery.n4{grid-template-columns:1fr 1fr}
.article-body .gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block}
.article-body .xlink{display:block;border:1px solid #e7e2d8;border-radius:14px;padding:14px 16px;background:#fff;margin:1.8em 0;text-decoration:none;color:inherit}
.article-body .xlink b{display:block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#FF5722;margin-bottom:4px}
.article-body .xlink span{font-size:14px;color:#5b5347;word-break:break-all}
@media (max-width:640px){
  .article-body{font-size:16px}
  .article-body .pull{font-size:20px}
  .article-body .gallery.n3{grid-template-columns:1fr 1fr}
  .article-body figure.w-inline{max-width:none}
}
@media (min-width:900px){
  .article-wide .article-body figure.w-full{margin-left:calc(50% - 50vw + 20px);margin-right:calc(50% - 50vw + 20px)}
}
`
