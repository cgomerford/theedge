import { NextRequest, NextResponse } from 'next/server';
import { getArticleById } from '@/lib/articles';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  // TODO: same auth gap as the other /api/admin routes.

  const { id } = await params;
  const article = await getArticleById(id);

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  return NextResponse.json(article, { status: 200 });
}