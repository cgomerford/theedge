import { NextRequest, NextResponse } from 'next/server';
import {
  createArticle,
  updateArticle,
  publishArticle,
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
  publish: boolean;
}

export async function POST(req: NextRequest) {
  // TODO: auth check — match whatever gates the rest of /admin today.

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

  // SEO gate: an excerpt is the meta description / OG description / Twitter
  // card description. Publishing without one means crawlers scrape the first
  // paragraph instead — allowed for drafts, blocked at publish time.
  if (payload.publish && !payload.excerpt?.trim()) {
    return NextResponse.json(
      { error: 'Add an excerpt before publishing — it powers the article\'s search/social preview.' },
      { status: 400 }
    );
  }

  try {
    let saved;

    if (payload.id) {
      saved = await updateArticle({
        id: payload.id,
        title: payload.title.trim(),
        body: payload.body,
        excerpt: payload.excerpt?.trim(),
        hero_image: payload.hero_image?.trim(),
        team_tags: payload.team_tags,
      });
    } else {
      saved = await createArticle({
        title: payload.title.trim(),
        slug: payload.slug.trim(),
        body: payload.body,
        excerpt: payload.excerpt?.trim(),
        hero_image: payload.hero_image?.trim(),
        team_tags: payload.team_tags,
        sport: payload.sport,
      });
    }

    if (!saved) {
      return NextResponse.json(
        { error: 'Save failed — the slug may already be in use.' },
        { status: 409 }
      );
    }

    if (payload.publish) {
      const published = await publishArticle(saved.id);
      if (!published) {
        return NextResponse.json(
          { error: 'Saved as draft, but publish step failed. Try publishing again.' },
          { status: 500 }
        );
      }
      return NextResponse.json(published, { status: 200 });
    }

    return NextResponse.json(saved, { status: 200 });
  } catch (err) {
    console.error('[POST /api/admin/articles] Unexpected error:', err);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}