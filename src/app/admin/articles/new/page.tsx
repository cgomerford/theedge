'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import ChartPickerModal from '@/components/admin/ChartPickerModal';

import ArticleEditorForm from '@/components/admin/ArticleEditorForm';


// Matches your existing team-tag vocabulary used across game pages / factors
const MLB_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BOS', 'CHC', 'CHW', 'CIN', 'CLE', 'COL', 'DET',
  'HOU', 'KC', 'LAA', 'LAD', 'MIA', 'MIL', 'MIN', 'NYM', 'NYY', 'OAK',
  'PHI', 'PIT', 'SD', 'SEA', 'SF', 'STL', 'TB', 'TEX', 'TOR', 'WSH',
];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function NewArticlePage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [excerpt, setExcerpt] = useState('');
  const [heroImage, setHeroImage] = useState('');
  const [teamTags, setTeamTags] = useState<string[]>([]);
  const [sport, setSport] = useState<'mlb' | 'nfl'>('mlb');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [articleId, setArticleId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [chartModalOpen, setChartModalOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false }),
    ],
    content: '',
    immediatelyRender: false, // avoids SSR hydration mismatch with Tiptap
  });

  // Auto-slug from title unless the user has manually edited the slug field
  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      if (!slugTouched) {
        setSlug(slugify(value));
      }
    },
    [slugTouched]
  );

  const toggleTeam = useCallback((code: string) => {
    setTeamTags((prev) =>
      prev.includes(code) ? prev.filter((t) => t !== code) : [...prev, code]
    );
  }, []);

  const insertImage = useCallback(() => {
    const url = window.prompt('Image URL:');
    if (url) {
      editor?.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const insertLink = useCallback(() => {
    const url = window.prompt('Link URL:');
    if (url) {
      editor?.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  const insertChart = useCallback(
    (url: string) => {
      editor?.chain().focus().setImage({ src: url, alt: 'Chart' }).run();
    },
    [editor]
  );

  const canSave = useMemo(
    () => title.trim().length > 0 && slug.trim().length > 0 && editor !== null,
    [title, slug, editor]
  );

  async function handleSave(publish: boolean) {
    if (!editor || !canSave) return;

    setSaveState('saving');
    setErrorMsg('');

    const payload = {
      id: articleId, // null on first save → API creates; present → API updates
      title: title.trim(),
      slug: slug.trim(),
      body: editor.getJSON(),
      excerpt: excerpt.trim() || undefined,
      hero_image: heroImage.trim() || undefined,
      team_tags: teamTags,
      sport,
      publish,
    };

    try {
      const res = await fetch('/api/admin/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }

      const saved = await res.json();
      setArticleId(saved.id);
      setSaveState('saved');

      if (publish) {
        router.push(`/articles/${saved.slug}`);
      }
    } catch (err) {
      setSaveState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, marginBottom: 24 }}>
        ⊕ New Article
      </h1>

      <div style={{ marginBottom: 18 }}>
        <label style={fieldLabelStyle}>Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Why the bullpen is quietly the Yankees' biggest edge"
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={fieldLabelStyle}>Slug</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => {
            setSlug(slugify(e.target.value));
            setSlugTouched(true);
          }}
          style={inputStyle}
        />
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>
          /articles/{slug || '...'}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={fieldLabelStyle}>Excerpt (shown on homepage / team hub cards)</label>
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={fieldLabelStyle}>Hero image URL</label>
        <input
          type="text"
          value={heroImage}
          onChange={(e) => setHeroImage(e.target.value)}
          placeholder="https://..."
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={fieldLabelStyle}>Sport</label>
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value as 'mlb' | 'nfl')}
          style={inputStyle}
        >
          <option value="mlb">MLB</option>
          <option value="nfl">NFL</option>
        </select>
      </div>

      <div style={{ marginBottom: 18 }}>
        <label style={fieldLabelStyle}>Team tags</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {MLB_TEAMS.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggleTeam(code)}
              style={{
                ...chipStyle,
                background: teamTags.includes(code) ? '#FF5722' : '#FAF8F3',
                color: teamTags.includes(code) ? '#FAF8F3' : '#1A1A1A',
                borderColor: teamTags.includes(code) ? '#FF5722' : '#1A1A1A',
              }}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={fieldLabelStyle}>Body</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleBold().run()}>B</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleItalic().run()}>I</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
            H2
          </ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            List
          </ToolbarBtn>
          <ToolbarBtn onClick={insertLink}>Link</ToolbarBtn>
          <ToolbarBtn onClick={insertImage}>Image</ToolbarBtn>
          <ToolbarBtn onClick={() => setChartModalOpen(true)}>Chart</ToolbarBtn>
        </div>
        <div
          style={{
            border: '1px solid #1A1A1A',
            minHeight: 320,
            padding: 16,
            background: '#FAF8F3',
          }}
        >
          <EditorContent editor={editor} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <button
          type="button"
          disabled={!canSave || saveState === 'saving'}
          onClick={() => handleSave(false)}
          style={{ ...btnStyle, opacity: canSave ? 1 : 0.4 }}
        >
          {saveState === 'saving' ? 'Saving…' : 'Save draft'}
        </button>
        <button
          type="button"
          disabled={!canSave || saveState === 'saving'}
          onClick={() => handleSave(true)}
          style={{ ...btnStyle, background: '#FF5722', opacity: canSave ? 1 : 0.4 }}
        >
          Publish
        </button>
      </div>

      {saveState === 'saved' && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#1a7d3a' }}>Draft saved.</div>
      )}
      {saveState === 'error' && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#c0392b' }}>{errorMsg}</div>
      )}

      {chartModalOpen && (
        <ChartPickerModal
          onInsert={insertChart}
          onClose={() => setChartModalOpen(false)}
        />
      )}
    </div>
  );
}

function ToolbarBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 10px',
        fontSize: 12,
        border: '1px solid #1A1A1A',
        background: '#FAF8F3',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  opacity: 0.6,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 10px',
  border: '1px solid #1A1A1A',
  background: '#FAF8F3',
  fontFamily: 'inherit',
  fontSize: 14,
};

const chipStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '5px 9px',
  border: '1px solid',
  cursor: 'pointer',
};

const btnStyle: React.CSSProperties = {
  padding: '11px 20px',
  fontSize: 12,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  background: '#1A1A1A',
  color: '#FAF8F3',
  border: 'none',
  cursor: 'pointer',
};