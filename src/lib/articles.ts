// lib/articles.ts

import { createAdminClient } from '@/lib/supabase';

// SERVER-ONLY FILE — uses the service-role key via createAdminClient().
// Never import this into a 'use client' component.

// Tiptap's JSON doc shape — loose on purpose since it's rendered generically
export interface TiptapDoc {
  type: 'doc';
  content?: Record<string, unknown>[]; // absent on an empty document
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
  dek: string | null;
  section: string | null;
  layout: ArticleLayout;
  seo_description: string | null;
}

export type ArticleLayout = 'standard' | 'feature' | 'data' | 'quick';
export const ARTICLE_LAYOUTS: ArticleLayout[] = ['standard', 'feature', 'data', 'quick'];

// Trimmed shape for list views (homepage, team hubs) — skips the heavy `body` field
// (the writer's newer fields, dek / section / layout / seo_description, are only read with the full article)
export type ArticleSummary = Omit<Article, 'body' | 'dek' | 'section' | 'layout' | 'seo_description'>;

const SUMMARY_COLUMNS =
  'id, title, slug, excerpt, hero_image, team_tags, sport, author, status, published_at, created_at, updated_at, subject_player_id, subject_player_name';
/**
 * Homepage "Latest from x9Lab" module.
 */
export async function getLatestArticles(limit = 6): Promise<ArticleSummary[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('articles')
    .select(SUMMARY_COLUMNS)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
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
    .lte('published_at', new Date().toISOString())
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
    .lte('published_at', new Date().toISOString())
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
  dek?: string;
  section?: string;
  layout?: ArticleLayout;
  seo_description?: string;
  subject_player_id?: number | null;
  subject_player_name?: string | null;
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
      ...extraFields(input),
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
  author?: string;
  dek?: string;
  section?: string;
  layout?: ArticleLayout;
  seo_description?: string;
  subject_player_id?: number | null;
  subject_player_name?: string | null;
}

// The writer's newer columns, only included when given, so a save from an older caller never blanks them.
function extraFields(i: Partial<CreateArticleInput>) {
  const o: Record<string, unknown> = {};
  if (i.dek !== undefined) o.dek = i.dek || null;
  if (i.section !== undefined) o.section = i.section || null;
  if (i.layout !== undefined && ARTICLE_LAYOUTS.includes(i.layout)) o.layout = i.layout;
  if (i.seo_description !== undefined) o.seo_description = i.seo_description || null;
  if (i.subject_player_id !== undefined) o.subject_player_id = i.subject_player_id;
  if (i.subject_player_name !== undefined) o.subject_player_name = i.subject_player_name;
  return o;
}

export async function updateArticle(input: UpdateArticleInput): Promise<Article | null> {
  const supabase = createAdminClient();
  const { id, ...fields } = input;
  const { dek, section, layout, seo_description, subject_player_id, subject_player_name, ...core } = fields;

  const { data, error } = await supabase
    .from('articles')
    .update({ ...core, ...extraFields({ dek, section, layout, seo_description, subject_player_id, subject_player_name }) })
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
export async function publishArticle(id: string, at?: string | null): Promise<Article | null> {
  const supabase = createAdminClient();

  // `at` in the future schedules the article: it is "published" but public queries hide it until that time.
  const when = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toISOString() : new Date().toISOString();
  const { data, error } = await supabase
    .from('articles')
    .update({
      status: 'published',
      published_at: when,
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

// ---- Revisions -------------------------------------------------------------------------------------------------------------------------

export interface ArticleRevision {
  id: string;
  article_id: string;
  title: string;
  kind: string;
  saved_at: string;
}

const MAX_REVISIONS = 40;

/** Stores a copy of the article as it was saved, then trims the history to the newest MAX_REVISIONS. Never throws; a failed history write must not block a save. */
export async function saveRevision(articleId: string, title: string, body: TiptapDoc, meta: Record<string, unknown>, kind: 'autosave' | 'save' | 'publish'): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from('article_revisions').insert({ article_id: articleId, title, body, meta, kind });
  if (error) {
    console.error('[saveRevision] Supabase error:', error.message);
    return;
  }
  const { data } = await supabase.from('article_revisions').select('id').eq('article_id', articleId).order('saved_at', { ascending: false }).range(MAX_REVISIONS, MAX_REVISIONS + 200);
  const old = (data ?? []).map((r: { id: string }) => r.id);
  if (old.length) await supabase.from('article_revisions').delete().in('id', old);
}

export async function listRevisions(articleId: string): Promise<ArticleRevision[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('article_revisions').select('id, article_id, title, kind, saved_at').eq('article_id', articleId).order('saved_at', { ascending: false }).limit(MAX_REVISIONS);
  if (error) {
    console.error('[listRevisions] Supabase error:', error.message);
    return [];
  }
  return (data ?? []) as ArticleRevision[];
}

export async function getRevision(id: string): Promise<{ title: string; body: TiptapDoc; meta: Record<string, unknown> } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('article_revisions').select('title, body, meta').eq('id', id).maybeSingle();
  if (error) {
    console.error('[getRevision] Supabase error:', error.message);
    return null;
  }
  return data as { title: string; body: TiptapDoc; meta: Record<string, unknown> } | null;
}
