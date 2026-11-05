// Images on content calendar items, in the PRIVATE content-assets bucket. Never public: the admin sees them through signed links (one hour) made here.
// Auth: an assistant's bearer token (only for items with its own source) or the admin cookie (any item). Delete is admin only.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'
import { isAdminRequest } from '@/lib/admin-auth'
import { ingestSource } from '@/lib/content-ingest-auth'
import { MAX_ASSETS, type Asset } from '@/lib/content-plan-core'
import { addAsset, getItemMeta, removeAsset } from '@/lib/content-plan'
import { ASSET_BUCKET, MAX_ASSET_BYTES, SIGNED_SECONDS, TYPES, tidyLabel, cleanRole, isAssetPath, sniffImage } from '@/lib/content-assets'
import { log } from '@/lib/log'

export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const err = (error: string, status: number) => NextResponse.json({ ok: false, error }, { status })

/** Who is calling and whether they may touch this item: admin may touch any, an assistant only its own. */
async function access(req: NextRequest, id: string) {
  const admin = await isAdminRequest(req)
  const source = admin ? null : await ingestSource(req)
  if (!admin && !source) return { fail: err('Not authorised.', 401) } as const
  if (!UUID.test(id)) return { fail: err('Unknown item.', 400) } as const
  const meta = await getItemMeta(id)
  if (meta === 'missing') return { fail: err('The calendar tables are not ready yet.', 503) } as const
  if (!meta) return { fail: err('That item was not found.', 404) } as const
  if (!admin && meta.source !== source) return { fail: err('That item belongs to another source.', 403) } as const
  return { admin, meta } as const
}

// POST multipart: id, file (png, jpeg or webp, up to 8 MB), label, role (thumbnail | graphic | other)
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  if (!form) return err('Send the image as multipart form data.', 400)
  const id = String(form.get('id') ?? '')
  const a = await access(req, id)
  if ('fail' in a) return a.fail
  if (a.meta.assets.length >= MAX_ASSETS) return err(`An item can hold ${MAX_ASSETS} images.`, 400)
  const file = form.get('file')
  if (!(file instanceof File)) return err('No file provided.', 400)
  if (file.size > MAX_ASSET_BYTES) return err('Image too large (8 MB at most).', 400)
  if (file.size === 0) return err('The file is empty.', 400)
  const buf = new Uint8Array(await file.arrayBuffer())
  const kind = sniffImage(buf)
  if (!kind) return err('Only PNG, JPEG or WebP images are accepted.', 400)
  const path = `${id}/${crypto.randomUUID()}.${kind === 'jpeg' ? 'jpg' : kind}`
  const supa = createAdminClient()
  const up = await supa.storage.from(ASSET_BUCKET).upload(path, buf, { contentType: TYPES[kind], cacheControl: '3600', upsert: false })
  if (up.error) { log.error('POST /api/admin/content-plan/assets', 'storage upload error', up.error.message); return err('Upload failed. Is the content-assets bucket created?', 500) }
  const asset: Asset = { path, label: tidyLabel(form.get('label'), file.name || 'image'), role: cleanRole(form.get('role')) }
  const saved = await addAsset(id, asset)
  if (!saved.ok) { await supa.storage.from(ASSET_BUCKET).remove([path]); return err(saved.error, saved.full ? 400 : 500) }
  return NextResponse.json({ ok: true, asset })
}

// GET ?id=...  ->  the item's images, each with a signed link that lasts an hour
export async function GET(req: NextRequest) {
  const a = await access(req, req.nextUrl.searchParams.get('id') ?? '')
  if ('fail' in a) return a.fail
  const supa = createAdminClient()
  const assets = await Promise.all(a.meta.assets.filter(x => isAssetPath(a.meta.id, x.path)).map(async x => {
    const { data, error } = await supa.storage.from(ASSET_BUCKET).createSignedUrl(x.path, SIGNED_SECONDS)
    if (error) log.error('GET /api/admin/content-plan/assets', 'signed url error', error.message)
    return { ...x, url: data?.signedUrl ?? null }
  }))
  return NextResponse.json({ ok: true, assets })
}

// DELETE ?id=...&path=...  (admin only)
export async function DELETE(req: NextRequest) {
  if (!(await isAdminRequest(req))) return err(await ingestSource(req) ? 'Assistants cannot delete.' : 'Not authorised.', (await ingestSource(req)) ? 403 : 401)
  const id = req.nextUrl.searchParams.get('id') ?? '', path = req.nextUrl.searchParams.get('path')
  const a = await access(req, id)
  if ('fail' in a) return a.fail
  if (!isAssetPath(id, path) || !a.meta.assets.some(x => x.path === path)) return err('That image is not on this item.', 404)
  const rm = await createAdminClient().storage.from(ASSET_BUCKET).remove([path])
  if (rm.error) log.error('DELETE /api/admin/content-plan/assets', 'storage remove error', rm.error.message)
  const r = await removeAsset(id, path)
  return r.ok ? NextResponse.json({ ok: true }) : err(r.error, 500)
}
