/**
 * useAudioCapture.js
 *
 * Captures two audio sources and merges them:
 *   1. Microphone  — your own voice
 *   2. Screen share (getDisplayMedia) — system audio = meeting participants
 *
 * Sends 3-second PCM float32 chunks to backend via WebSocket.
 */

import { useRef, useState, useCallback } from 'react'
import { api } from '../utils/api'

const CHUNK_MS      = 3000    // send every 3 seconds
const SAMPLE_RATE   = 16000   // Whisper wants 16kHz
const NUM_CHANNELS  = 1       // mono

export function useAudioCapture() {
  const [status, setStatus]       = useState('idle')   // idle | capturing | error
  const [error, setError]         = useState(null)
  const [hasMic, setHasMic]       = useState(false)
  const [hasScreen, setHasScreen] = useState(false)

  const wsRef            = useRef(null)
  const ctxRef           = useRef(null)
  const processorRef     = useRef(null)
  const micStreamRef     = useRef(null)
  const screenStreamRef  = useRef(null)
  const bufferRef        = useRef([])
  const samplesRef       = useRef(0)
  const chunkSamplesRef  = useRef(SAMPLE_RATE * (CHUNK_MS / 1000))   // 48000

  const _cleanup = useCallback(() => {
    processorRef.current?.disconnect()
    processorRef.current = null
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    micStreamRef.current = null
    screenStreamRef.current?.getTracks().forEach(t => t.stop())
    screenStreamRef.current = null
    bufferRef.current = []
    samplesRef.current = 0
  }, [])

  const start = useCallback(async (sessionId, { withScreen = false } = {}) => {
    setError(null)
    setStatus('capturing')

    try {
      // 1. Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      })
      micStreamRef.current = micStream
      setHasMic(true)

      // 2. Screen share (optional — contains meeting audio from others)
      let screenStream = null
      if (withScreen) {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,          // required by browser even if we only want audio
            audio: {
              channelCount: 1,
              sampleRate: SAMPLE_RATE,
              suppressLocalAudioPlayback: false,
            },
          })
          // Drop video track — we only need audio
          screenStream.getVideoTracks().forEach(t => t.stop())
          screenStreamRef.current = screenStream
          setHasScreen(true)
        } catch (e) {
          console.warn('Screen share declined or unavailable:', e.message)
          // Continue with mic-only
        }
      }

      // 3. AudioContext + merger
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      ctxRef.current = ctx

      const merger = ctx.createChannelMerger(2)
      const dest   = ctx.createMediaStreamDestination()

      const micSource = ctx.createMediaStreamSource(micStream)
      micSource.connect(merger, 0, 0)

      if (screenStream && screenStream.getAudioTracks().length > 0) {
        const screenSource = ctx.createMediaStreamSource(screenStream)
        screenSource.connect(merger, 0, 1)
      }

      merger.connect(dest)

      // 4. ScriptProcessor to collect PCM samples
      const bufSize  = 4096
      const processor = ctx.createScriptProcessor(bufSize, 1, 1)
      processorRef.current = processor

      const targetSamples = chunkSamplesRef.current

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        bufferRef.current.push(new Float32Array(input))
        samplesRef.current += input.length

        if (samplesRef.current >= targetSamples) {
          // Flatten buffer
          const total = samplesRef.current
          const flat  = new Float32Array(total)
          let offset  = 0
          for (const chunk of bufferRef.current) {
            flat.set(chunk, offset)
            offset += chunk.length
          }

          bufferRef.current  = []
          samplesRef.current = 0

          // Send raw PCM bytes over WebSocket
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(flat.buffer)
          }
        }
      }

      // Connect merger output → processor → dummy destination (required)
      const mergerSource = ctx.createMediaStreamSource(dest.stream)
      mergerSource.connect(processor)
      processor.connect(ctx.destination)

      // 5. WebSocket
      const ws = new WebSocket(api.wsUrl(sessionId))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onclose = () => {
        if (status === 'capturing') setStatus('idle')
      }
      ws.onerror = (e) => {
        setError('WebSocket connection error')
        setStatus('error')
      }

    } catch (err) {
      setError(err.message)
      setStatus('error')
      _cleanup()
    }
  }, [_cleanup])

  const stop = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    _cleanup()
    setStatus('idle')
    setHasMic(false)
    setHasScreen(false)
  }, [_cleanup])

  return { status, error, hasMic, hasScreen, start, stop, wsRef }
}
