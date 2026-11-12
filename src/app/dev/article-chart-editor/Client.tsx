'use client'

// Dev harness for the article chart block: a bare Tiptap editor with the chart block, the "Insert chart" dialog and the "Convert chart markers" dialog, preloaded with the four Trevor Rogers markers (and one unreadable
// marker) the way a draft arrives. The admin writer itself is behind sign-in, so this is how the dialogs are exercised in a browser. Nothing here saves anywhere.
import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { ChartBlockNode } from '@/components/admin/article-writer/extensions'
import { ChartInsertModal, ConvertMarkersModal } from '@/components/admin/article-writer/ChartDialogs'
import { ROGERS_MARKERS } from '@/lib/article-chart-fixtures'

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const DOC = { type: 'doc', content: [
  p('Rogers is still the No. 2 free agent.'),
  p(ROGERS_MARKERS[0]),
  p('A paragraph between the charts.'),
  p(ROGERS_MARKERS[1]),
  p(ROGERS_MARKERS[2]),
  p(ROGERS_MARKERS[3]),
  p('[CHART: pie | broken marker | labels: a | v = 1]'),
] }

export default function Client() {
  const [insert, setInsert] = useState(false)
  const [convert, setConvert] = useState(false)
  const editor = useEditor({ extensions: [StarterKit, ChartBlockNode], content: DOC, immediatelyRender: false, editorProps: { attributes: { class: 'article-body', 'aria-label': 'Body' } } })
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px 80px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button type="button" onClick={() => setInsert(true)}>Insert chart</button>
        <button type="button" onClick={() => setConvert(true)}>Convert chart markers</button>
      </div>
      <EditorContent editor={editor} />
      {insert && <ChartInsertModal initial={null} onClose={() => setInsert(false)} onSave={c => { editor?.chain().focus().insertContent({ type: 'chartBlock', attrs: { type: c.type, title: c.title, labels: c.labels, series: c.series, yUnit: c.yUnit ?? '', source: c.source ?? '', caption: c.caption ?? '', alt: c.alt } }).run(); setInsert(false) }} />}
      {convert && editor && <ConvertMarkersModal editor={editor} onClose={() => setConvert(false)} />}
    </div>
  )
}
