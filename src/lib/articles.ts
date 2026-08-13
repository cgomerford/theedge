// lib/articles.ts

import { createAdminClient } from '@/lib/supabase';

// SERVER-ONLY FILE — uses the service-role key via createAdminClient().
// Never import this into a 'use client' component.

// Tiptap's JSON doc shape — loose on purpose since it's rendered generically
export interface TiptapDoc {
  type: 'doc';
  content: Record<string, unknown>[];
}

export async function getArticleById(id: string): Promise<Article | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[getArticleById] Supabase error:', error.message);
    return null;
  }

  return data;
}
export interface Article {
  id: string;
  title: string;
  slug: string;
  body: TiptapDoc;
  excerpt: string | null;
  hero_image: string | null;
  team_tags: string[];
  sport: string;
  author: string;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  updated_at: string;
  subject_player_id: number | null;
  subject_player_name: string | null;
}

// Trimmed shape for list views (homepage, team hubs) — skips the heavy `body` field
export type ArticleSummary = Omit<Article, 'body'>;

const SUMMARY_COLUMNS =
  'id, title, slug, excerpt, hero_image, team_tags, sport, author, status, published_at, created_at, updated_at';

/**
 * Homepage "Latest from The Edge" module.
 */
export async function getLatestArticles(limit = 6): Promise<ArticleSummary[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .select(SUMMARY_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getLatestArticles] Supabase error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Team hub pages — articles tagged with a given team code (e.g. 'NYY').
 */
export async function getArticlesByTeam(
  teamCode: string,
  limit = 10
): Promise<ArticleSummary[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .select(SUMMARY_COLUMNS)
    .eq('status', 'published')
    .contains('team_tags', [teamCode])
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getArticlesByTeam] Supabase error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Full article for the public /articles/[slug] page.
 * Returns null on any not-found or draft-viewed-publicly case — caller should 404.
 */
export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();

  if (error) {
    console.error('[getArticleBySlug] Supabase error:', error.message);
    return null;
  }

  return data;
}

/**
 * Admin-only: fetch by slug regardless of status, for the editor's "load draft" flow.
 */
export async function getArticleBySlugForAdmin(slug: string): Promise<Article | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    console.error('[getArticleBySlugForAdmin] Supabase error:', error.message);
    return null;
  }

  return data;
}

export interface CreateArticleInput {
  title: string;
  slug: string;
  body: TiptapDoc;
  excerpt?: string;
  hero_image?: string;
  team_tags: string[];
  sport?: string;
  author?: string;
}

/**
 * Creates a draft. Publishing is a separate explicit step (see publishArticle)
 * so a half-written article can never accidentally go live via a stray save.
 */
export async function createArticle(input: CreateArticleInput): Promise<Article | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .insert({
      title: input.title,
      slug: input.slug,
      body: input.body,
      excerpt: input.excerpt ?? null,
      hero_image: input.hero_image ?? null,
      team_tags: input.team_tags,
      sport: input.sport ?? 'mlb',
      author: input.author ?? 'George',
      status: 'draft',
    })
    .select()
    .single();

  if (error) {
    console.error('[createArticle] Supabase error:', error.message);
    return null;
  }

  return data;
}

export interface UpdateArticleInput {
  id: string;
  title?: string;
  body?: TiptapDoc;
  excerpt?: string;
  hero_image?: string;
  team_tags?: string[];
}

export async function updateArticle(input: UpdateArticleInput): Promise<Article | null> {
  const supabase = createAdminClient();
  const { id, ...fields } = input;

  const { data, error } = await supabase
    .from('articles')
    .update(fields)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[updateArticle] Supabase error:', error.message);
    return null;
  }

  return data;
}

/**
 * Explicit publish step — sets status + published_at together so a draft
 * can never end up "published" with a null published_at (which would break
 * the ordering index on the homepage query).
 */
export async function publishArticle(id: string): Promise<Article | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .update({
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[publishArticle] Supabase error:', error.message);
    return null;
  }

  return data;
}

export async function unpublishArticle(id: string): Promise<Article | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .update({ status: 'draft' })
    .eq('id', id)
    .single();

  if (error) {
    console.error('[unpublishArticle] Supabase error:', error.message);
    return null;
  }

  return data;
}