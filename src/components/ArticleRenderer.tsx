import type { TiptapDoc } from '@/lib/articles';

// Loose node typing matches the loose TiptapDoc type in lib/articles.ts —
// intentionally not importing Tiptap's own types here to keep this component
// dependency-free (it only needs to run, never needs the editor).
interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

export default function ArticleRenderer({ body }: { body: TiptapDoc }) {
  // body.content is typed as Record<string, unknown>[] in lib/articles.ts —
  // route through `unknown` since the two types don't overlap enough for
  // TypeScript to trust a direct cast.
  const content = body.content as unknown as TiptapNode[];
  return <div className="article-body">{renderNodes(content)}</div>;
}

function renderNodes(nodes: TiptapNode[] | undefined): React.ReactNode {
  if (!nodes) return null;
  return nodes.map((node, i) => <Node key={i} node={node} />);
}

function Node({ node }: { node: TiptapNode }) {
  switch (node.type) {
    case 'paragraph':
      return <p>{renderNodes(node.content)}</p>;

    case 'heading': {
      const level = (node.attrs?.level as number) ?? 2;
      // Editor toolbar only offers H2, but render H1/H3 too in case content
      // ever comes from elsewhere (e.g. a future import script)
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

    case 'image':
      return (
        <img
          src={node.attrs?.src as string}
          alt={(node.attrs?.alt as string) ?? ''}
          loading="lazy"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      );

    case 'hardBreak':
      return <br />;

    case 'text':
      return <TextNode node={node} />;

    default:
      // Unknown node type from the JSON — render children if any exist rather
      // than dropping content silently, but skip the wrapper element itself.
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
      case 'link': {
        const href = mark.attrs?.href as string;
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