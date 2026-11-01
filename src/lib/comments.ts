// src/lib/comments.ts
//
// Reader comments on articles. Table ownership: this file is the only writer of article_comments and article_comment_reports
// (supabase/migrations/20261101100000_article_comments.sql). Signed-in readers only; plain text; no links.

import { createAdminClient } from '@/lib/supabase'

export const MAX_BODY = 1000
export const MAX_NAME = 30
export const PER_HOUR = 5
export const REPORTS_TO_HIDE = 3

export type Comment = { id: string; author_name: string; body: string; created_at: string }
export type AdminComment = Comment & { article_id: string; article_title: string | null; article_slug: string | null; status: string; reports: number }

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|ly|xyz|me)\b)/i

/** Pure check of what a reader typed. Returns the cleaned values or the message to show. */
export function checkComment(nameIn: unknown, bodyIn: unknown): { ok: true; name: string; body: string } | { ok: false; error: string } {
  const name = String(nameIn ?? '').replace(/\s+/g, ' ').trim()
  const body = String(bodyIn ?? '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (name.length < 2 || name.length > MAX_NAME) return { ok: false, error: `Choose a name of 2 to ${MAX_NAME} characters.` }
  if (name.includes('@') || LINK.test(name)) return { ok: false, error: 'Leave email addresses and links out of your name.' }
  if (body.length < 2) return { ok: false, error: 'Write a comment first.' }
  if (body.length > MAX_BODY) return { ok: false, error: `Keep it under ${MAX_BODY} characters.` }
  if (LINK.test(body)) return { ok: false, error: 'Links are not allowed in comments.' }
  return { ok: true, name, body }
}

/** Visible comments for one article, oldest first. [] on failure. */
export async function getComments(articleId: string): Promise<Comment[]> {
  const { data, error } = await createAdminClient()
    .from('article_comments')
    .select('id, author_name, body, created_at')
    .eq('article_id', articleId)
    .eq('status', 'visible')
    .order('created_at', { ascending: true })
    .limit(300)
  if (error) { console.error('[getComments] Supabase error:', error.message); return [] }
  return (data ?? []) as Comment[]
}

export async function addComment(articleId: string, subscriberId: string, nameIn: unknown, bodyIn: unknown): Promise<{ ok: true; comment: Comment } | { ok: false; error: string }> {
  const checked = checkComment(nameIn, bodyIn)
  if (!checked.ok) return checked
  const supa = createAdminClient()

  const { data: art } = await supa.from('articles').select('id').eq('id', articleId).not('published_at', 'is', null).lte('published_at', new Date().toISOString()).maybeSingle()
  if (!art) return { ok: false, error: 'This article is not open for comments.' }

  const since = new Date(Date.now() - 3600_000).toISOString()
  const { count, error: cErr } = await supa.from('article_comments').select('id', { count: 'exact', head: true }).eq('subscriber_id', subscriberId).gte('created_at', since)
  if (cErr) { console.error('[addComment] count error:', cErr.message); return { ok: false, error: 'Could not post. Try again.' } }
  if ((count ?? 0) >= PER_HOUR) return { ok: false, error: 'You have posted a few comments already. Try again in an hour.' }

  const { data: dupe } = await supa.from('article_comments').select('id').eq('subscriber_id', subscriberId).eq('article_id', articleId).eq('body', checked.body).maybeSingle()
  if (dupe) return { ok: false, error: 'You already posted that.' }

  const { data, error } = await supa.from('article_comments').insert({ article_id: articleId, subscriber_id: subscriberId, author_name: checked.name, body: checked.body }).select('id, author_name, body, created_at').single()
  if (error || !data) { console.error('[addComment] Supabase error:', error?.message); return { ok: false, error: 'Could not post. Try again.' } }
  return { ok: true, comment: data as Comment }
}

/** One report per reader per comment; the third distinct report hides it. */
export async function reportComment(commentId: string, subscriberId: string): Promise<boolean> {
  const supa = createAdminClient()
  const { error } = await supa.from('article_comment_reports').upsert({ comment_id: commentId, subscriber_id: subscriberId }, { onConflict: 'comment_id,subscriber_id', ignoreDuplicates: true })
  if (error) { console.error('[reportComment] Supabase error:', error.message); return false }
  const { count } = await supa.from('article_comment_reports').select('comment_id', { count: 'exact', head: true }).eq('comment_id', commentId)
  if ((count ?? 0) >= REPORTS_TO_HIDE) await supa.from('article_comments').update({ status: 'hidden' }).eq('id', commentId)
  return true
}

/** Admin: newest comments of any status, with report counts. */
export async function listAllComments(limit = 200): Promise<AdminComment[]> {
  const supa = createAdminClient()
  const { data, error } = await supa.from('article_comments').select('id, article_id, author_name, body, status, created_at, articles(title, slug)').order('created_at', { ascending: false }).limit(limit)
  if (error) { console.error('[listAllComments] Supabase error:', error.message); return [] }
  type Row = { id: string; article_id: string; author_name: string; body: string; status: string; created_at: string; articles: { title: string; slug: string } | { title: string; slug: string }[] | null }
  const rows = (data ?? []) as unknown as Row[]
  const ids = rows.map(r => r.id)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: reps } = await supa.from('article_comment_reports').select('comment_id').in('comment_id', ids)
    for (const r of (reps ?? []) as { comment_id: string }[]) counts.set(r.comment_id, (counts.get(r.comment_id) ?? 0) + 1)
  }
  return rows.map(r => {
    const a = Array.isArray(r.articles) ? r.articles[0] : r.articles
    return { id: r.id, article_id: r.article_id, author_name: r.author_name, body: r.body, status: r.status, created_at: r.created_at, article_title: a?.title ?? null, article_slug: a?.slug ?? null, reports: counts.get(r.id) ?? 0 }
  })
}

export async function setCommentStatus(id: string, status: 'visible' | 'hidden' | 'delete'): Promise<boolean> {
  const supa = createAdminClient()
  const { error } = status === 'delete' ? await supa.from('article_comments').delete().eq('id', id) : await supa.from('article_comments').update({ status }).eq('id', id)
  if (error) console.error('[setCommentStatus] Supabase error:', error.message)
  return !error
}
