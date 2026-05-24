/**
 * useTranscript.js
 * Listens to the WebSocket from useAudioCapture and manages chunk state.
 */

import { useState, useEffect, useRef } from 'react'

export function useTranscript(wsRef) {
  const [chunks, setChunks]   = useState([])
  const [lastErr, setLastErr] = useState(null)

  useEffect(() => {
    const interval = setInterval(() => {
      const ws = wsRef.current
      if (!ws) return

      const prev = ws.onmessage

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'chunk' && msg.chunk?.text) {
            setChunks(prev => [msg.chunk, ...prev].slice(0, 500))
          } else if (msg.type === 'error') {
            setLastErr(msg.message)
          }
        } catch (_) {}
      }
    }, 200)

    return () => clearInterval(interval)
  }, [wsRef])

  const clear = () => setChunks([])

  return { chunks, lastErr, clear }
}
