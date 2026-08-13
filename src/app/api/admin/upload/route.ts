// app/api/admin/upload/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

const BUCKET = 'article-images';
const MAX_BYTES = 8 * 1024 * 1024; // 8MB — plenty for a chart PNG, keeps abuse limited

export async function POST(req: NextRequest) {
  // TODO: same auth gap as /api/admin/articles — wire to match your /admin
  // auth pattern once confirmed.

  const formData = await req.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 8MB)' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const ext = file.type.split('/')[1] ?? 'png';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '31536000', // 1 year — chart snapshots don't change after upload
      upsert: false,
    });

  if (uploadError) {
    console.error('[POST /api/admin/upload] Supabase storage error:', uploadError.message);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ url: publicUrlData.publicUrl }, { status: 200 });
}