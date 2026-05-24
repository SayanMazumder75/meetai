export default function StatsBar({ chunks, elapsed }) {
  const words    = chunks.reduce((n, c) => n + c.text.split(' ').length, 0)
  const speakers = new Set(chunks.map(c => c.speaker)).size
  const langs    = [...new Set(chunks.map(c => c.language))].join(' · ').toUpperCase()
  const mins     = Math.floor(elapsed / 60)
  const secs     = elapsed % 60

  return (
    <div className="grid grid-cols-4 gap-3 mb-4">
      {[
        { val: `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`, label: 'Duration' },
        { val: chunks.length, label: 'Chunks' },
        { val: words,         label: 'Words' },
        { val: langs || '—',  label: 'Languages' },
      ].map(({ val, label }) => (
        <div key={label} className="card p-4 text-center relative overflow-hidden group hover:-translate-y-0.5 transition-transform">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
          <div className="text-2xl font-extrabold tracking-tight text-slate-100">{val}</div>
          <div className="text-xs uppercase tracking-widest text-slate-600 mt-1 font-semibold">{label}</div>
          <div className="w-6 h-0.5 bg-accent mx-auto mt-1.5 opacity-50 rounded-full" />
        </div>
      ))}
    </div>
  )
}
