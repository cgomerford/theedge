'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import ChartPickerModal from '@/components/admin/ChartPickerModal';
import type { Article } from '@/lib/articles';

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

interface ArticleEditorFormProps {
  initialArticle?: Article;
}

export default function ArticleEditorForm({ initialArticle }: ArticleEditorFormProps) {
  const router = useRouter();
  const isEditing = !!initialArticle;

  const [title, setTitle] = useState(initialArticle?.title ?? '');
  const [slug, setSlug] = useState(initialArticle?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [excerpt, setExcerpt] = useState(initialArticle?.excerpt ?? '');
  const [heroImage, setHeroImage] = useState(initialArticle?.hero_image ?? '');
  const [teamTags, setTeamTags] = useState<string[]>(initialArticle?.team_tags ?? []);
  const [sport, setSport] = useState<'mlb' | 'nfl'>(
    (initialArticle?.sport as 'mlb' | 'nfl') ?? 'mlb'
  );
  // Subject player — optional. When set, the public article page can pull a
  // live percentile strip for this player into the right rail.
  const [subjectPlayerId, setSubjectPlayerId] = useState<string>(
    initialArticle?.subject_player_id != null ? String(initialArticle.subject_player_id) : ''
  );
  const [subjectPlayerName, setSubjectPlayerName] = useState(
    initialArticle?.subject_player_name ?? ''
  );
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [articleId, setArticleId] = useState<string | null>(initialArticle?.id ?? null);
  const [errorMsg, setErrorMsg] = useState('');
  const [chartModalOpen, setChartModalOpen] = useState(false);

const editor = useEditor({
    extensions: [StarterKit, Image, Link.configure({ openOnClick: false })],
    content: '',
    immediatelyRender: false,
    editorProps: {
      handlePaste(view, event) {
        const items = event.clipboardData?.items
        if (!items) return false

        const imageItem = Array.from(items).find(item => item.type.startsWith('image/'))
        if (!imageItem) return false // let Tiptap handle normal text paste

        const file = imageItem.getAsFile()
        if (!file) return false

        event.preventDefault()

        ;(async () => {
          try {
            const formData = new FormData()
            formData.append('file', file, file.name || 'pasted-image.png')

            const res = await fetch('/api/admin/upload', { method: 'POST', body: formData })
            if (!res.ok) {
              const body = await res.json().catch(() => ({}))
              throw new Error(body.error ?? 'Upload failed')
            }

            const { url } = await res.json()
            const { schema } = view.state
            const node = schema.nodes.image.create({ src: url })
            const transaction = view.state.tr.replaceSelectionWith(node)
            view.dispatch(transaction)
          } catch (err) {
            console.error('Pasted image upload failed:', err)
            window.alert(err instanceof Error ? err.message : 'Image paste failed — try again.')
          }
        })()

        return true // we've handled this paste
      },
    },
  });

  useEffect(() => {
    if (editor && initialArticle?.body) {
      editor.commands.setContent(initialArticle.body);
    }
  }, [editor, initialArticle]);

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
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const insertLink = useCallback(() => {
    const url = window.prompt('Link URL:');
    if (url) editor?.chain().focus().setLink({ href: url }).run();
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

    const parsedPlayerId = subjectPlayerId.trim() ? Number(subjectPlayerId.trim()) : undefined;
    if (subjectPlayerId.trim() && Number.isNaN(parsedPlayerId)) {
      setSaveState('error');
      setErrorMsg('Subject player ID must be a number.');
      return;
    }

    const payload = {
      id: articleId,
      title: title.trim(),
      slug: slug.trim(),
      body: editor.getJSON(),
      excerpt: excerpt.trim() || undefined,
      hero_image: heroImage.trim() || undefined,
      team_tags: teamTags,
      sport,
      subject_player_id: parsedPlayerId,
      subject_player_name: subjectPlayerName.trim() || undefined,
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
        ⊕ {isEditing ? 'Edit Article' : 'New Article'}
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
          {isEditing && (
            <span style={{ color: '#c0392b' }}> — changing this breaks the existing live URL</span>
          )}
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

      <div style={{ marginBottom: 18, padding: 14, border: '1px dashed #1A1A1A', background: '#F3EFE4' }}>
        <label style={fieldLabelStyle}>
          Subject player <span style={{ opacity: 0.5, textTransform: 'none' }}>(optional — for Breakdown-style articles)</span>
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            inputMode="numeric"
            value={subjectPlayerId}
            onChange={(e) => setSubjectPlayerId(e.target.value)}
            placeholder="MLB player ID, e.g. 592450"
            style={{ ...inputStyle, flex: '0 0 200px' }}
          />
          <input
            type="text"
            value={subjectPlayerName}
            onChange={(e) => setSubjectPlayerName(e.target.value)}
            placeholder="Display name, e.g. Travis Bazzana"
            style={inputStyle}
          />
        </div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>
          When set, the article page shows a live percentile strip for this player in the sidebar.
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={fieldLabelStyle}>Body</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleBold().run()}>B</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleItalic().run()}>I</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>H1</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>H2</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>H3</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleBulletList().run()}>List</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().toggleBlockquote().run()}>Quote</ToolbarBtn>
          <ToolbarBtn onClick={insertLink}>Link</ToolbarBtn>
          <ToolbarBtn onClick={insertImage}>Image</ToolbarBtn>
          <ToolbarBtn onClick={() => setChartModalOpen(true)}>Chart</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().undo().run()}>Undo</ToolbarBtn>
          <ToolbarBtn onClick={() => editor?.chain().focus().redo().run()}>Redo</ToolbarBtn>
        </div>
        <div style={{ border: '1px solid #1A1A1A', minHeight: 320, padding: 16, background: '#FAF8F3' }}>
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
        <div style={{ marginTop: 12, fontSize: 12, color: '#1a7d3a' }}>Saved.</div>
      )}
      {saveState === 'error' && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#c0392b' }}>{errorMsg}</div>
      )}

      {chartModalOpen && (
        <ChartPickerModal onInsert={insertChart} onClose={() => setChartModalOpen(false)} />
      )}
    </div>
  );
}

function ToolbarBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #1A1A1A', background: '#FAF8F3', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.6, marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 10px', border: '1px solid #1A1A1A', background: '#FAF8F3', fontFamily: 'inherit', fontSize: 14,
};
const chipStyle: React.CSSProperties = { fontSize: 11, padding: '5px 9px', border: '1px solid', cursor: 'pointer' };
const btnStyle: React.CSSProperties = {
  padding: '11px 20px', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', background: '#1A1A1A', color: '#FAF8F3', border: 'none', cursor: 'pointer',
};