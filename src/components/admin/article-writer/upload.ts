// Browser-side image upload for the article writer: shrinks large pictures first (long side 2000 px, WebP), then posts to /api/admin/upload.
// A GIF is sent as it is (resizing would flatten the animation). Returns the public URL.

const MAX_SIDE = 2000

async function shrink(file: File): Promise<File> {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
    if (scale === 1 && file.size <= 1_500_000) { bmp.close(); return file }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.86))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' })
  } catch {
    return file
  }
}

export async function uploadImage(file: File): Promise<string> {
  const small = await shrink(file)
  const fd = new FormData()
  fd.append('file', small, small.name || 'image.png')
  const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `Upload failed (${res.status})`)
  }
  return ((await res.json()) as { url: string }).url
}
