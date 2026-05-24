/**
 * useAudioCapture.js — FIXED
 * WS opened first, onmessage attached immediately after open.
 * No polling race condition.
 */

import { useRef, useState, useCallback } from 'react'
import { api } from '../utils/api'

const CHUNK_MS    = 3000
const SAMPLE_RATE = 16000

export function useAudioCapture({ onChunk, onError } = {}) {
  const [status, setStatus]       = useState('idle')
  const [error, setError]         = useState(null)
  const [hasMic, setHasMic]       = useState(false)
  const [hasScreen, setHasScreen] = useState(false)

  const wsRef           = useRef(null)
  const ctxRef          = useRef(null)
  const processorRef    = useRef(null)
  const micStreamRef    = useRef(null)
  const screenStreamRef = useRef(null)
  const bufferRef       = useRef([])
  const samplesRef      = useRef(0)
  const targetSamples   = SAMPLE_RATE * (CHUNK_MS / 1000)

  const _cleanup = useCallback(() => {
    try { processorRef.current?.disconnect() } catch (_) {}
    try { ctxRef.current?.close() } catch (_) {}
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    processorRef.current = null
    ctxRef.current = null
    micStreamRef.current = null
    screenStreamRef.current = null
    bufferRef.current = []
    samplesRef.current = 0
  }, [])

  const start = useCallback(async (sessionId, { withScreen = false } = {}) => {
    setError(null)
    setStatus('capturing')

    try {
      // 1. Mic
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount:1, sampleRate:SAMPLE_RATE, echoCancellation:true, noiseSuppression:true, autoGainControl:true },
        video: false,
      })
      micStreamRef.current = micStream
      setHasMic(true)

      // 2. Screen (optional)
      let screenStream = null
      if (withScreen) {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video:true, audio:{ channelCount:1 } })
          screenStream.getVideoTracks().forEach(t => t.stop())
          screenStreamRef.current = screenStream
          setHasScreen(true)
        } catch (e) { console.warn('Screen share declined:', e.message) }
      }

      // 3. Open WebSocket FIRST — attach onmessage immediately
      const ws = new WebSocket(api.wsUrl(sessionId))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      await new Promise((resolve, reject) => {
        ws.onopen  = resolve
        ws.onerror = () => reject(new Error('WebSocket failed to connect. Check backend URL.'))
        setTimeout(() => reject(new Error('WebSocket timed out (10s)')), 10000)
      })

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'chunk' && msg.chunk?.text) {
            onChunk?.(msg.chunk)
          } else if (msg.type === 'error') {
            onError?.(msg.message)
          }
        } catch (_) {}
      }

      ws.onclose = () => {
        setStatus(s => s === 'capturing' ? 'idle' : s)
        setHasMic(false)
        setHasScreen(false)
      }

      ws.onerror = () => {
        setError('WebSocket disconnected unexpectedly')
        setStatus('error')
      }

      // 4. AudioContext — merge mic + screen
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      ctxRef.current = ctx

      const dest = ctx.createMediaStreamDestination()

      const micSrc = ctx.createMediaStreamSource(micStream)
      const micGain = ctx.createGain()
      micGain.gain.value = 1.0
      micSrc.connect(micGain)
      micGain.connect(dest)

      if (screenStream?.getAudioTracks().length > 0) {
        const scrSrc = ctx.createMediaStreamSource(screenStream)
        const scrGain = ctx.createGain()
        scrGain.gain.value = 1.0
        scrSrc.connect(scrGain)
        scrGain.connect(dest)
      }

      // 5. ScriptProcessor → collect PCM → send every CHUNK_MS
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        bufferRef.current.push(new Float32Array(input))
        samplesRef.current += input.length

        if (samplesRef.current >= targetSamples) {
          const flat = new Float32Array(samplesRef.current)
          let off = 0
          for (const c of bufferRef.current) { flat.set(c, off); off += c.length }
          bufferRef.current = []
          samplesRef.current = 0

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(flat.buffer)
          }
        }
      }

      const destSrc = ctx.createMediaStreamSource(dest.stream)
      destSrc.connect(processor)
      processor.connect(ctx.destination)

    } catch (err) {
      setError(err.message)
      setStatus('error')
      _cleanup()
    }
  }, [_cleanup, onChunk, onError])

  const stop = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    _cleanup()
    setStatus('idle')
    setHasMic(false)
    setHasScreen(false)
  }, [_cleanup])

  return { status, error, hasMic, hasScreen, start, stop }
}