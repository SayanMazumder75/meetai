import { useState } from 'react'

const LANG_NAMES = { en: 'EN', hi: 'HI', bn: 'BN' }

export default function TranscriptPanel({ chunks }) {
  const [search, setSearch] = useState('')

  const filtered = search
    ? chunks.filter(c => c.text.toLowerCase().includes(search.toLowerCase()))
    : chunks

  const wordCount = chunks.reduce((n, c) => n + c.text.split(' ').length, 0)

  return (
    <div className="card p-5 flex flex-col h-full">
      <div className="section-header">
        📝 Live Transcript
        <span className="ml-auto text-slate-600 text-xs normal-case tracking-normal font-normal">
          {wordCount} words · {chunks.length} chunks
        </span>
      </div>

      {/* Search */}
      <input
        className="w-full bg-navy-700 border border-navy-600 rounded-xl px-3 py-2 text-sm text-slate-200
                   placeholder:text-slate-600 outline-none focus:border-accent mb-3 transition-colors"
        placeholder="🔍 Search transcript…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Chunks */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-1">
        {filtered.length === 0 && (
          <p className="text-slate-600 text-sm text-center mt-8">
            {chunks.length === 0
              ? 'Transcript will appear here once recording starts…'
              : 'No results for that search.'}
          </p>
        )}
        {filtered.map(chunk => (
          <ChunkCard key={chunk.id} chunk={chunk} search={search} />
        ))}
      </div>
    </div>
  )
}

function ChunkCard({ chunk, search }) {
  const highlighted = search
    ? chunk.text.replace(
        new RegExp(`(${search})`, 'gi'),
        '<mark class="bg-accent/20 text-accent rounded px-0.5">$1</mark>',
      )
    : chunk.text

  return (
    <div className="chunk-card animate-slide-up">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono text-xs text-slate-600">{chunk.time_label}</span>
        <span className="font-bold text-accent text-xs">{chunk.speaker}</span>
        {chunk.language && chunk.language !== 'en' && (
          <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded font-mono">
            {LANG_NAMES[chunk.language] || chunk.language.toUpperCase()}
          </span>
        )}
        {chunk.translated && (
          <span className="text-xs bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">
            translated
          </span>
        )}
        <span className="ml-auto text-xs text-slate-700">
          {Math.round(chunk.confidence * 100)}%
        </span>
      </div>
      <p
        className="text-slate-300 text-sm leading-relaxed"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  )
}
