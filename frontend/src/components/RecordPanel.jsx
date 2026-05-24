export default function RecordPanel({
  status, hasMic, hasScreen, error,
  onStart, onStop, sessionId,
}) {
  const isCapturing = status === 'capturing'

  return (
    <div className="card p-5 mb-4">
      <div className="section-header">🎙 Audio Capture</div>

      {/* Source indicators */}
      <div className="flex gap-3 mb-4">
        <SourceBadge active={hasMic}    icon="🎤" label="Microphone" />
        <SourceBadge active={hasScreen} icon="🖥" label="Screen Audio" />
      </div>

      {!isCapturing ? (
        <div className="flex flex-col gap-2">
          <button
            className="btn-primary w-full py-3 text-base"
            onClick={() => onStart({ withScreen: false })}
          >
            ▶ Start — Mic Only
          </button>
          <button
            className="btn w-full py-3 text-base"
            onClick={() => onStart({ withScreen: true })}
            title="Captures your mic + meeting audio from screen share"
          >
            🖥 Start — Mic + Screen Audio
            <span className="ml-2 text-xs text-slate-500">(for Google Meet / Zoom)</span>
          </button>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            <b className="text-slate-500">Mic + Screen</b> = captures everyone in the call via
            system audio. Browser will ask you to share your screen — pick the meeting window.
          </p>
        </div>
      ) : (
        <button className="btn-danger w-full py-3 text-base" onClick={onStop}>
          ⏹ Stop Recording
        </button>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
          ⚠ {error}
        </div>
      )}

      {isCapturing && (
        <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs animate-fade-in">
          ✓ Listening… audio sent every 3 seconds for transcription.
          {hasScreen && <> Screen audio also captured.</>}
        </div>
      )}
    </div>
  )
}

function SourceBadge({ active, icon, label }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
      ${active
        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        : 'bg-navy-700 border-navy-600 text-slate-600'
      }`}>
      <span>{icon}</span>
      <span>{label}</span>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
    </div>
  )
}
