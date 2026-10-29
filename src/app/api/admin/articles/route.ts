// src/app/api/admin/articles/route.ts
//
// The article writer's save endpoint.
//   POST  save a draft, autosave, or publish / schedule (publish = true, optional publish_at)
//   GET   ?id=<article>            the revision list (newest first)
//         ?revision=<id>           one revision's title, body and meta, to restore it
// Auth: isAdminRequest (the /admin sign-in cookie); src/proxy.ts does not cover /api.
// An autosave of an already-published article never touches the live row; it only writes a revision.

import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/admin-auth';
import { lintProse } from '@/lib/banned-words';
import { docText } from '@/lib/article-doc';
import {
  createArticle,
  updateArticle,
  publishArticle,
  getArticleById,
  saveRevision,
  listRevisions,
  getRevision,
  type ArticleLayout,
  type TiptapDoc,
} from '@/lib/articles';

interface SaveArticleRequest {
  id: string | null;
  title: string;
  slug: string;
  body: TiptapDoc;
  excerpt?: string;
  hero_image?: string;
  team_tags: string[];
  sport?: string;
  author?: string;
  dek?: string;
  section?: string;
  layout?: ArticleLayout;
  seo_description?: string;
  subject_player_id?: number;
  subject_player_name?: string;
  publish: boolean;
  publish_at?: string;
  autosave?: boolean;
}

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  const revision = req.nextUrl.searchParams.get('revision');
  if (revision) {
    const r = await getRevision(revision);
    return r ? NextResponse.json(r) : NextResponse.json({ error: 'Revision not found' }, { status: 404 });
  }
  if (id) return NextResponse.json({ revisions: await listRevisions(id) });
  return NextResponse.json({ error: 'Pass id or revision' }, { status: 400 });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let payload: SaveArticleRequest;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload.title?.trim() || !payload.slug?.trim()) {
    return NextResponse.json({ error: 'Title and slug are required' }, { status: 400 });
  }
  if (!payload.body || payload.body.type !== 'doc') {
    return NextResponse.json({ error: 'Invalid article body' }, { status: 400 });
  }

  if (payload.publish) {
    // SEO gate: the excerpt (or the search description) is the meta description and the share text.
    if (!(payload.excerpt?.trim() || payload.seo_description?.trim())) {
      return NextResponse.json({ error: 'Write an excerpt or a search description before publishing. It powers the search and share preview.' }, { status: 400 });
    }
    // Content gate: the same word list the site's copy check uses (prediction, betting and fantasy-advice words).
    const text = [payload.title, payload.dek ?? '', payload.excerpt ?? '', payload.seo_description ?? '', docText(payload.body)].join('\n');
    const hits = lintProse(text);
    if (hits.length) {
      const words = [...new Set(hits.map(h => h.word.toLowerCase()))].join(', ');
      return NextResponse.json({ error: `Remove these words before publishing: ${words}. Open the Checks tab to see where.` }, { status: 400 });
    }
  }

  const fields = {
    title: payload.title.trim(),
    body: payload.body,
    excerpt: payload.excerpt?.trim(),
    hero_image: payload.hero_image?.trim(),
    team_tags: payload.team_tags ?? [],
    dek: payload.dek?.trim(),
    section: payload.section?.trim(),
    layout: payload.layout,
    seo_description: payload.seo_description?.trim(),
    subject_player_id: payload.subject_player_id ?? null,
    subject_player_name: payload.subject_player_name?.trim() || null,
  };
  const meta = { excerpt: fields.excerpt, hero_image: fields.hero_image, team_tags: fields.team_tags, dek: fields.dek, section: fields.section, layout: fields.layout, seo_description: fields.seo_description };

  try {
    let saved;

    if (payload.id) {
      const existing = await getArticleById(payload.id);
      if (!existing) return NextResponse.json({ error: 'Article not found' }, { status: 404 });

      // Autosave of a live article: history only, the public page stays as published.
      if (payload.autosave && existing.status === 'published' && !payload.publish) {
        await saveRevision(existing.id, fields.title, fields.body, meta, 'autosave');
        return NextResponse.json({ id: existing.id, slug: existing.slug, status: existing.status, published_at: existing.published_at, updated_at: existing.updated_at, historyOnly: true });
      }
      saved = await updateArticle({ id: payload.id, ...fields, author: payload.author?.trim() || undefined });
    } else {
      saved = await createArticle({ slug: payload.slug.trim(), sport: payload.sport, author: payload.author?.trim() || undefined, ...fields });
    }

    if (!saved) {
      return NextResponse.json({ error: 'Save failed. The slug may already be in use, or the article-writer SQL has not been run yet.' }, { status: 409 });
    }

    await saveRevision(saved.id, fields.title, fields.body, meta, payload.publish ? 'publish' : payload.autosave ? 'autosave' : 'save');

    if (payload.publish) {
      const published = await publishArticle(saved.id, payload.publish_at);
      if (!published) {
        return NextResponse.json({ error: 'Saved as draft, but the publish step failed. Try publishing again.' }, { status: 500 });
      }
      return NextResponse.json(published, { status: 200 });
    }

    return NextResponse.json(saved, { status: 200 });
  } catch (err) {
    console.error('[POST /api/admin/articles] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
