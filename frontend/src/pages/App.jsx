import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../utils/api'
import { useAudioCapture } from '../hooks/useAudioCapture'
import Topbar from '../components/Topbar'
import RecordPanel from '../components/RecordPanel'
import TranscriptPanel from '../components/TranscriptPanel'
import SummaryPanel from '../components/SummaryPanel'
import StatsBar from '../components/StatsBar'

export default function App() {
  const [title, setTitle]           = useState(`Meeting ${new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })}`)
  const [sessionId, setSessionId]   = useState(null)
  const [chunks, setChunks]         = useState([])
  const [elapsed, setElapsed]       = useState(0)
  const timerRef                    = useRef(null)

  const { status, error, hasMic, hasScreen, start, stop, wsRef } = useAudioCapture()
  const isCapturing = status === 'capturing'

  // Attach WebSocket message handler
  useEffect(() => {
    const poll = setInterval(() => {
      const ws = wsRef.current
      if (!ws) return
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'chunk' && msg.chunk?.text) {
            setChunks(prev => [msg.chunk, ...prev].slice(0, 500))
          }
        } catch (_) {}
      }
    }, 100)
    return () => clearInterval(poll)
  }, [wsRef])

  // Elapsed timer
  useEffect(() => {
    if (isCapturing) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [isCapturing])

  const handleStart = useCallback(async ({ withScreen }) => {
    // Create backend session
    const sess = await api.createSession(title)
    setSessionId(sess.session_id)
    setChunks([])
    setElapsed(0)
    await start(sess.session_id, { withScreen })
  }, [title, start])

  const handleStop = useCallback(() => {
    stop()
  }, [stop])

  return (
    <div className="min-h-screen bg-navy-950 text-slate-100 font-sans">
      <Topbar title={title} onTitleChange={setTitle} isCapturing={isCapturing} />

      <div className="max-w-7xl mx-auto px-4 pb-12">
        {/* Stats */}
        {(isCapturing || chunks.length > 0) && (
          <StatsBar chunks={chunks} elapsed={elapsed} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column */}
          <div className="lg:col-span-1 flex flex-col gap-4">
            <RecordPanel
              status={status}
              hasMic={hasMic}
              hasScreen={hasScreen}
              error={error}
              sessionId={sessionId}
              onStart={handleStart}
              onStop={handleStop}
            />
            <SummaryPanel sessionId={sessionId} chunks={chunks} />
          </div>

          {/* Right column */}
          <div className="lg:col-span-2" style={{ minHeight: '70vh' }}>
            {chunks.length === 0 && !isCapturing ? (
              <WelcomeCard />
            ) : (
              <TranscriptPanel chunks={chunks} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WelcomeCard() {
  return (
    <div className="card p-8 text-center relative overflow-hidden h-full flex flex-col items-center justify-center">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
      <div className="text-5xl mb-4">🎙️</div>
      <h2 className="text-2xl font-bold mb-2 tracking-tight">MeetAI Transcriber</h2>
      <p className="text-slate-500 text-sm leading-relaxed max-w-sm mb-6">
        Live transcription for English, Hindi &amp; Bengali meetings.<br />
        Captures your mic — and optionally screen audio to hear everyone in the call.
      </p>
      <div className="grid grid-cols-3 gap-4 text-left w-full max-w-md">
        {[
          { icon: '🎤', title: 'Your Mic', desc: 'Captures your own voice in real-time.' },
          { icon: '🖥', title: 'Screen Audio', desc: 'Google Meet, Zoom, Teams — all captured via screen share.' },
          { icon: '🌐', title: 'Translate', desc: 'Hindi & Bengali auto-translated to English.' },
        ].map(({ icon, title, desc }) => (
          <div key={title} className="bg-navy-700 border border-navy-600 rounded-xl p-3">
            <div className="text-xl mb-1">{icon}</div>
            <div className="font-semibold text-xs text-slate-200 mb-1">{title}</div>
            <div className="text-xs text-slate-600 leading-relaxed">{desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
