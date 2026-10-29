// src/components/ArticleRenderer.tsx
//
// Renders a stored article (Tiptap JSON) for readers: the public page and the admin preview. Server-safe, no Tiptap import. Handles the
// standard nodes plus the writer's blocks (figure, pullQuote, statRow, playerCard, dataTable, gallery, xEmbed). The writer's canvas draws the
// same markup and classes (src/components/article/article-css.ts), so what is typed is what is published.

import type { TiptapDoc } from '@/lib/articles';
import { headshotCutoutUrl } from '@/lib/mlb-assets';
import { parseTable, safeHttpUrl } from '@/lib/article-blocks';

// Loose node typing matches the loose TiptapDoc type in lib/articles.ts.
interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

export default function ArticleRenderer({ body }: { body: TiptapDoc }) {
  const content = body.content as unknown as TiptapNode[];
  return <div className="article-body">{renderNodes(content)}</div>;
}

function renderNodes(nodes: TiptapNode[] | undefined): React.ReactNode {
  if (!nodes) return null;
  return nodes.map((node, i) => <Node key={i} node={node} />);
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function Node({ node }: { node: TiptapNode }) {
  const a = node.attrs ?? {};
  switch (node.type) {
    case 'paragraph':
      return <p>{renderNodes(node.content)}</p>;

    case 'heading': {
      const level = (a.level as number) ?? 2;
      if (level === 1) return <h1>{renderNodes(node.content)}</h1>;
      if (level === 3) return <h3>{renderNodes(node.content)}</h3>;
      return <h2>{renderNodes(node.content)}</h2>;
    }

    case 'bulletList':
      return <ul>{renderNodes(node.content)}</ul>;
    case 'orderedList':
      return <ol>{renderNodes(node.content)}</ol>;
    case 'listItem':
      return <li>{renderNodes(node.content)}</li>;
    case 'blockquote':
      return <blockquote>{renderNodes(node.content)}</blockquote>;
    case 'horizontalRule':
      return <hr />;
    case 'codeBlock':
      return <pre style={{ background: '#f1eee6', borderRadius: 10, padding: 14, overflowX: 'auto', fontSize: 14 }}><code>{renderNodes(node.content)}</code></pre>;

    case 'image':
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={str(a.src)} alt={str(a.alt)} loading="lazy" style={{ maxWidth: '100%', height: 'auto' }} />
      );

    case 'figure': {
      const src = safeHttpUrl(a.src);
      if (!src) return null;
      const width = ['inline', 'wide', 'full'].includes(str(a.width)) ? str(a.width) : 'wide';
      const ratio = str(a.ratio);
      const ar = ratio && ratio !== 'auto' ? ratio.replace(':', '/') : null;
      return (
        <figure className={`w-${width}${ar ? ' ar' : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={str(a.alt)} loading="lazy" style={ar ? { aspectRatio: ar, objectPosition: `${Number(a.focalX ?? 50)}% ${Number(a.focalY ?? 50)}%` } : undefined} />
          {(str(a.caption) || str(a.credit)) && (
            <figcaption>{str(a.caption)}{str(a.caption) && str(a.credit) ? ' ' : ''}{str(a.credit) && <b>{str(a.credit)}</b>}</figcaption>
          )}
        </figure>
      );
    }

    case 'pullQuote':
      return <div className="pull">{renderNodes(node.content)}</div>;

    case 'statRow': {
      const items = Array.isArray(a.items) ? (a.items as { value?: string; label?: string; sample?: string }[]) : [];
      if (!items.length) return null;
      return (
        <div className="stats">
          {items.map((it, i) => (
            <div key={i}><b>{it.value}</b><span>{it.label}</span>{it.sample ? <small>{it.sample}</small> : null}</div>
          ))}
        </div>
      );
    }

    case 'playerCard': {
      const id = Number(a.playerId);
      if (!Number.isFinite(id) || id <= 0) return null;
      return (
        <a className="pcard" href={`/mlb/players/${id}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={headshotCutoutUrl(id, 240)} alt={str(a.name)} loading="lazy" />
          <div><b>{str(a.name)}</b><span>{[str(a.team), str(a.line)].filter(Boolean).join(' · ')}</span></div>
        </a>
      );
    }

    case 'dataTable': {
      const { head, rows } = parseTable(str(a.rows));
      if (!head.length) return null;
      return (
        <div className="tbl-wrap">
          <table>
            <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}>{head.map((_, j) => <td key={j}>{r[j] ?? ''}</td>)}</tr>)}</tbody>
          </table>
          {str(a.caption) ? <div className="ab-cap" style={{ padding: '0 12px 10px' }}>{str(a.caption)}</div> : null}
        </div>
      );
    }

    case 'gallery': {
      const imgs = (Array.isArray(a.images) ? (a.images as { src?: string; alt?: string; caption?: string }[]) : []).filter(im => safeHttpUrl(im.src)).slice(0, 4);
      if (!imgs.length) return null;
      return (
        <figure>
          <div className={`gallery n${imgs.length}`}>
            {imgs.map((im, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={safeHttpUrl(im.src)!} alt={im.alt ?? ''} loading="lazy" />
            ))}
          </div>
          {str(a.caption) ? <figcaption>{str(a.caption)}</figcaption> : null}
        </figure>
      );
    }

    case 'xEmbed': {
      const url = safeHttpUrl(a.url);
      if (!url) return null;
      return (
        <a className="xlink" href={url} target="_blank" rel="noopener noreferrer"><b>Post on X</b><span>{url}</span></a>
      );
    }

    case 'hardBreak':
      return <br />;

    case 'text':
      return <TextNode node={node} />;

    default:
      // Unknown node type from the JSON: render children if any exist rather than dropping content silently.
      return <>{renderNodes(node.content)}</>;
  }
}

function TextNode({ node }: { node: TiptapNode }) {
  let content: React.ReactNode = node.text;

  if (!node.marks) return <>{content}</>;

  for (const mark of node.marks) {
    switch (mark.type) {
      case 'bold':
        content = <strong>{content}</strong>;
        break;
      case 'italic':
        content = <em>{content}</em>;
        break;
      case 'underline':
        content = <u>{content}</u>;
        break;
      case 'code':
        content = <code>{content}</code>;
        break;
      case 'link': {
        const href = safeHttpUrl(mark.attrs?.href) ?? '#';
        content = (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {content}
          </a>
        );
        break;
      }
    }
  }

  return <>{content}</>;
}
