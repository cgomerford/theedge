import { notFound } from 'next/navigation';
import { getArticleById } from '@/lib/articles';
import ArticleWriter from '@/components/admin/article-writer/ArticleWriter';

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = 'force-dynamic';

export default async function EditArticlePage({ params }: PageProps) {
  const { id } = await params;
  const article = await getArticleById(id);

  if (!article) {
    notFound();
  }

  return <ArticleWriter initialArticle={article} />;
}
