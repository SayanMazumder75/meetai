/**
 * useAudioCapture.js — Fully corrected
 * - Raw PCM audio (Float32Array) sent over WebSocket
 * - No ScriptProcessorNode packing errors
 * - AudioContext resumed explicitly
 * - Buffer overflow protection
 */

import { useRef, useState, useCallback } from 'react'
import { api } from '../utils/api'

const CHUNK_MS    = 3000      // send every 3 seconds
const SAMPLE_RATE = 16000     // 16 kHz mono
const TARGET_SAMPLES = SAMPLE_RATE * (CHUNK_MS / 1000)  // 48000 samples

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
  const bufferRef       = useRef([])      // accumulated Float32Array chunks
  const samplesRef      = useRef(0)       // total samples in buffer

  // Cleanup all resources
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
      // 1. Get microphone stream
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false,
      })
      micStreamRef.current = micStream
      setHasMic(true)

      // 2. Optional screen share (audio only)
      let screenStream = null
      if (withScreen) {
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { channelCount: 1 }
          })
          // We don't need video, stop those tracks
          screenStream.getVideoTracks().forEach(t => t.stop())
          screenStreamRef.current = screenStream
          setHasScreen(true)
        } catch (e) {
          console.warn('Screen share declined:', e.message)
        }
      }

      // 3. Open WebSocket FIRST and attach onmessage immediately
      const ws = new WebSocket(api.wsUrl(sessionId))
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      await new Promise((resolve, reject) => {
        ws.onopen = resolve
        ws.onerror = () => reject(new Error('WebSocket connection failed'))
        setTimeout(() => reject(new Error('WebSocket timeout (10s)')), 10000)
      })

      // Set up message handler
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'chunk' && msg.chunk?.text) {
            onChunk?.(msg.chunk)
          } else if (msg.type === 'error') {
            onError?.(msg.message)
          }
        } catch (err) {
          console.warn('Failed to parse WebSocket message', err)
        }
      }

      ws.onclose = () => {
        setStatus(s => (s === 'capturing' ? 'idle' : s))
        setHasMic(false)
        setHasScreen(false)
        _cleanup()
      }

      ws.onerror = () => {
        setError('WebSocket error')
        setStatus('error')
        _cleanup()
      }

      // 4. Create AudioContext and merge mic + screen
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      ctxRef.current = ctx

      const dest = ctx.createMediaStreamDestination()

      // Microphone source
      const micSrc = ctx.createMediaStreamSource(micStream)
      const micGain = ctx.createGain()
      micGain.gain.value = 1.0
      micSrc.connect(micGain)
      micGain.connect(dest)

      // Screen audio source (if available)
      if (screenStream?.getAudioTracks().length > 0) {
        const scrSrc = ctx.createMediaStreamSource(screenStream)
        const scrGain = ctx.createGain()
        scrGain.gain.value = 1.0
        scrSrc.connect(scrGain)
        scrGain.connect(dest)
      }

      // 5. ScriptProcessorNode (deprecated but works) to collect audio
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0) // Float32Array
        bufferRef.current.push(input)
        samplesRef.current += input.length

        // Send when we have accumulated enough samples
        if (samplesRef.current >= TARGET_SAMPLES && wsRef.current?.readyState === WebSocket.OPEN) {
          // Flatten buffer into one Float32Array
          const flat = new Float32Array(samplesRef.current)
          let offset = 0
          for (const chunk of bufferRef.current) {
            flat.set(chunk, offset)
            offset += chunk.length
          }
          // Send raw PCM bytes
          wsRef.current.send(flat.buffer)

          // Reset buffer
          bufferRef.current = []
          samplesRef.current = 0
        }

        // Safety: prevent unbounded buffer growth if WebSocket is closed
        if (wsRef.current?.readyState !== WebSocket.OPEN && samplesRef.current > TARGET_SAMPLES * 10) {
          bufferRef.current = []
          samplesRef.current = 0
        }
      }

      // Connect processor to the merged stream
      const destSrc = ctx.createMediaStreamSource(dest.stream)
      destSrc.connect(processor)
      processor.connect(ctx.destination)

      // 6. IMPORTANT: Resume AudioContext (required on many browsers)
      await ctx.resume()

    } catch (err) {
      console.error('Failed to start capture:', err)
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