import { notFound } from 'next/navigation';
import { getArticleById } from '@/lib/articles';
import ArticleEditorForm from '@/components/admin/ArticleEditorForm';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditArticlePage({ params }: PageProps) {
  const { id } = await params;
  const article = await getArticleById(id);

  if (!article) {
    notFound();
  }

  return <ArticleEditorForm initialArticle={article} />;
}