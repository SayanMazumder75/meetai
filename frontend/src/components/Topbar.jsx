export default function Topbar({ title, onTitleChange, isCapturing }) {
  return (
    <div className="sticky top-3 z-50 mx-4 mb-4">
      <div className="card px-4 py-3 flex items-center gap-3 backdrop-blur-xl bg-navy-950/90 border-navy-600">
        {/* Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-accent/30">
            M
          </div>
          <span className="font-bold text-sm hidden sm:block text-slate-200">MeetAI</span>
        </div>

        <div className="w-px h-5 bg-navy-600 shrink-0" />

        {/* Title */}
        <input
          className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-slate-200 placeholder:text-slate-600 min-w-0"
          value={title}
          onChange={e => onTitleChange(e.target.value)}
          placeholder="Meeting title…"
          disabled={isCapturing}
        />

        {/* Status indicator */}
        {isCapturing && (
          <div className="flex items-center gap-2 shrink-0 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1">
            <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse-dot" />
            <span className="text-red-400 text-xs font-bold tracking-wider">LIVE</span>
          </div>
        )}
      </div>
    </div>
  )
}
