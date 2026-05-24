import { useState } from 'react'
import { api } from '../utils/api'

export default function SummaryPanel({ sessionId, chunks }) {
  const [summary, setSummary]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)

  const generate = async () => {
    if (!sessionId || chunks.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.summarizeSession(sessionId)
      setSummary(data)
    } catch (e) {
      setError('Failed to generate summary.')
    } finally {
      setLoading(false)
    }
  }

  const download = () => {
    window.open(api.exportUrl(sessionId), '_blank')
  }

  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="section-header">
        📋 AI Summary
        <div className="ml-auto flex gap-2">
          {sessionId && chunks.length > 0 && (
            <button className="btn text-xs py-1.5 px-3" onClick={download}>
              ⬇ Export .txt
            </button>
          )}
          <button
            className="btn-primary text-xs py-1.5 px-3"
            onClick={generate}
            disabled={loading || chunks.length < 5}
          >
            {loading ? '…' : '✨ Generate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
          {error}
        </div>
      )}

      {!summary && !loading && (
        <p className="text-slate-600 text-sm">
          {chunks.length < 5
            ? 'Keep talking — summary needs at least 5 chunks.'
            : 'Click ✨ Generate to create an AI summary of the meeting.'}
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-slate-500 text-sm">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Analysing transcript…
        </div>
      )}

      {summary && (
        <div className="space-y-4 animate-fade-in">
          {/* Summary */}
          {summary.summary && (
            <div className="p-4 bg-emerald-500/7 border border-emerald-500/20 rounded-xl">
              <div className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-2">Summary</div>
              <p className="text-slate-300 text-sm leading-relaxed">{summary.summary}</p>
            </div>
          )}

          {/* Action items */}
          {summary.action_items?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2">✅ Action Items</div>
              <div className="space-y-1.5">
                {summary.action_items.map((item, i) => (
                  <div key={i} className="flex gap-2 p-2.5 bg-amber-500/7 border border-amber-500/20 border-l-2 border-l-amber-400 rounded-r-xl text-sm text-slate-300">
                    <span className="text-amber-400 shrink-0">→</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key points */}
          {summary.key_points?.length > 0 && (
            <div>
              <div className="text-xs font-bold text-accent uppercase tracking-wider mb-2">💡 Key Points</div>
              <div className="space-y-1.5">
                {summary.key_points.map((pt, i) => (
                  <div key={i} className="flex gap-2 p-2.5 bg-accent/7 border border-accent/20 border-l-2 border-l-accent rounded-r-xl text-sm text-slate-300">
                    <span className="text-accent shrink-0">•</span>
                    <span>{pt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
