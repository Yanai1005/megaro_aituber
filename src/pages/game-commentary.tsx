import { useState, useEffect, useRef, useCallback } from 'react'
import Head from 'next/head'
import { Toasts } from '@/components/toasts'
import homeStore from '@/features/stores/home'
import settingsStore from '@/features/stores/settings'
import { handleSendChatFn } from '@/features/chat/handlers'
import { Message } from '@/features/messages/messages'
import '@/lib/i18n'

// 右側に固定表示するための専用VRMキャンバス
function GameVrmViewer() {
  const canvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (canvas) {
      const { viewer } = homeStore.getState()
      const { selectedVrmPath } = settingsStore.getState()
      viewer.setup(canvas)
      viewer.loadVrm(selectedVrmPath)
    }
  }, [])
  return <canvas ref={canvasRef} className="w-full h-full" />
}

const GAME_COMMENTARY_SYSTEM_PROMPT = `あなたはゲーム実況者・解説者です。プレイヤーがゲームをプレイしている画面を見て、楽しく親しみやすい実況・解説を行ってください。
ゲームの状況を分かりやすく説明し、プレイヤーへのアドバイスや次の展開の予測なども交えながら、テンポよく短めに解説してください。
感情は [happy], [sad], [angry], [relaxed], [surprised] の形式で文章の先頭に付けてください。`

const AUTO_COMMENT_PROMPT =
  'この画面を見て、ゲームの状況を短く実況してください。'

function getMessageText(content: Message['content']): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const item = content.find((c) => c.type === 'text')
    return item && 'text' in item ? item.text : ''
  }
  return ''
}

// 感情タグ [xxx] を取り除いて表示用テキストを返す
function stripEmotionTag(text: string): string {
  return text.replace(/^\s*\[[^\]]+\]\s*/, '')
}

export default function GameCommentary() {
  const chatLog = homeStore((s) => s.chatLog)
  const chatProcessing = homeStore((s) => s.chatProcessing)
  const handleSendChat = handleSendChatFn()

  const [userInput, setUserInput] = useState('')
  const [isStreamActive, setIsStreamActive] = useState(false)
  const [autoEnabled, setAutoEnabled] = useState(false)
  const [autoInterval, setAutoInterval] = useState(30)
  const [isCapturing, setIsCapturing] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)

  const [apiKey, setApiKey] = useState('')
  const [aiService, setAiService] = useState('openai')
  const [aiModel, setAiModel] = useState('gpt-4o')
  const [voiceEngine, setVoiceEngine] = useState('openai')

  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    settingsStore.setState({
      systemPrompt: GAME_COMMENTARY_SYSTEM_PROMPT,
      enableMultiModal: true,
      multiModalMode: 'always',
    })
    const ss = settingsStore.getState()
    setAiService(ss.selectAIService)
    setAiModel(ss.selectAIModel)
    setVoiceEngine(ss.selectVoice || 'openai')
    if (ss.selectAIService === 'openai') setApiKey(ss.openaiKey || '')
    if (ss.selectAIService === 'anthropic') setApiKey(ss.anthropicKey || '')
  }, [])

  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      stream.getTracks()[0].addEventListener('ended', () => {
        streamRef.current = null
        setIsStreamActive(false)
        setAutoEnabled(false)
      })
      setIsStreamActive(true)
    } catch {
      // キャンセル時は何もしない
    }
  }, [])

  const stopScreenShare = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setIsStreamActive(false)
    setAutoEnabled(false)
  }, [])

  const captureAndSend = useCallback(
    async (text: string) => {
      if (chatProcessing) return
      if (streamRef.current && videoRef.current) {
        setIsCapturing(true)
        const video = videoRef.current
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 1280
        canvas.height = video.videoHeight || 720
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0)
          homeStore.setState({
            modalImage: canvas.toDataURL('image/jpeg', 0.7),
          })
        }
        setIsCapturing(false)
      }
      handleSendChat(text)
    },
    [chatProcessing, handleSendChat]
  )

  useEffect(() => {
    if (autoEnabled && isStreamActive) {
      autoTimerRef.current = setInterval(
        () => captureAndSend(AUTO_COMMENT_PROMPT),
        autoInterval * 1000
      )
    } else {
      if (autoTimerRef.current) {
        clearInterval(autoTimerRef.current)
        autoTimerRef.current = null
      }
    }
    return () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current)
    }
  }, [autoEnabled, isStreamActive, autoInterval, captureAndSend])

  const handleSend = useCallback(() => {
    if (!userInput.trim() || chatProcessing) return
    captureAndSend(userInput)
    setUserInput('')
  }, [userInput, chatProcessing, captureAndSend])

  const saveSettings = useCallback(() => {
    settingsStore.setState({
      selectAIService: aiService as ReturnType<
        typeof settingsStore.getState
      >['selectAIService'],
      selectAIModel: aiModel,
      selectVoice: voiceEngine as ReturnType<
        typeof settingsStore.getState
      >['selectVoice'],
      enableMultiModal: true,
      multiModalMode: 'always' as const,
      systemPrompt: GAME_COMMENTARY_SYSTEM_PROMPT,
      ...(aiService === 'openai' && { openaiKey: apiKey }),
      ...(aiService === 'anthropic' && { anthropicKey: apiKey }),
    })
  }, [aiService, aiModel, apiKey, voiceEngine])

  return (
    <div className="relative h-screen overflow-hidden bg-black">
      <Head>
        <title>ゲーム解説 AI</title>
      </Head>

      {/* ゲーム映像エリア（フルスクリーン） */}
      <div className="absolute inset-0 z-0">
        {isStreamActive ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center h-full space-y-6 px-12">
              <div className="text-7xl"></div>
              <div className="text-center space-y-2">
                <h1 className="text-white text-3xl font-bold">ゲーム解説 AI</h1>
                <p className="text-gray-400 text-base">
                  画面共有でゲームをAIが実況・解説します
                </p>
              </div>
              <button
                onClick={startScreenShare}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-4 rounded-2xl text-lg font-bold transition-colors shadow-lg"
              >
                画面共有を開始
              </button>
              <p className="text-gray-600 text-sm text-center max-w-xs">
                ブラウザの「タブ」共有でゲームタブを選択してください
              </p>
            </div>
          </>
        )}
      </div>

      {/* VRMキャラクター（右端に固定） */}
      <div className="pointer-events-none absolute right-0 top-0 w-72 h-full z-5">
        <GameVrmViewer />
      </div>

      {/* チャットログ（右下、透明背景） */}
      <div className="pointer-events-none absolute bottom-6 right-4 z-15 w-80 flex flex-col gap-1.5 max-h-64 overflow-hidden justify-end">
        {chatLog
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-6)
          .map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <p
                className={`text-xs leading-relaxed max-w-[85%] ${
                  msg.role === 'user' ? 'text-blue-200' : 'text-white'
                }`}
                style={{
                  textShadow:
                    '0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)',
                }}
              >
                {msg.role === 'user' && (
                  <span className="opacity-50 mr-1">あなた:</span>
                )}
                {stripEmotionTag(getMessageText(msg.content))}
              </p>
            </div>
          ))}
        {chatProcessing && (
          <div className="flex justify-start">
            <div className="flex gap-1 items-center">
              <span className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce" />
              <span
                className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce"
                style={{ animationDelay: '0.1s' }}
              />
              <span
                className="w-1.5 h-1.5 bg-white/70 rounded-full animate-bounce"
                style={{ animationDelay: '0.2s' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* フローティングコントロールボタン（右上） */}
      <div className="absolute top-4 right-4 z-30 flex flex-col items-end gap-2">
        {isStreamActive && (
          <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            共有中
            {autoEnabled && (
              <span className="text-yellow-400 ml-1">・自動実況</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          {isStreamActive && (
            <button
              onClick={() => captureAndSend(AUTO_COMMENT_PROMPT)}
              disabled={chatProcessing}
              className="bg-green-600/90 hover:bg-green-600 disabled:opacity-40 backdrop-blur-sm text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shadow-lg"
            >
              {isCapturing ? '...' : '解説'}
            </button>
          )}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="bg-gray-900/80 hover:bg-gray-800 backdrop-blur-sm text-white w-11 h-11 rounded-xl text-xl transition-colors shadow-lg flex items-center justify-center"
          >
            {panelOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* スライドドロワー（統合パネル） */}
      <div
        className={`absolute top-0 right-0 h-full w-80 z-20 flex flex-col bg-gray-900/95 backdrop-blur-md border-l border-gray-700/50 shadow-2xl transition-transform duration-300 ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 shrink-0">
          <span className="text-white font-medium text-sm">設定</span>
          <button
            onClick={() => setPanelOpen(false)}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* 統合コンテンツ */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* ── 画面共有 ── */}
          <section className="space-y-2">
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
              画面共有
            </h3>
            <div className="flex gap-2">
              {!isStreamActive ? (
                <button
                  onClick={startScreenShare}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  開始
                </button>
              ) : (
                <>
                  <button
                    onClick={() => captureAndSend(AUTO_COMMENT_PROMPT)}
                    disabled={chatProcessing}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {isCapturing ? '取得中...' : '今すぐ解説'}
                  </button>
                  <button
                    onClick={stopScreenShare}
                    className="bg-red-700 hover:bg-red-800 text-white px-3 py-2 rounded-lg text-sm transition-colors"
                  >
                    停止
                  </button>
                </>
              )}
            </div>
          </section>

          {/* ── 自動実況 ── */}
          <section className="space-y-2">
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
              自動実況
            </h3>
            <div className="flex items-center gap-3 bg-gray-800/60 rounded-lg px-3 py-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={autoEnabled}
                  onChange={(e) => setAutoEnabled(e.target.checked)}
                  disabled={!isStreamActive}
                  className="w-3.5 h-3.5 accent-green-500"
                />
                有効
              </label>
              <select
                value={autoInterval}
                onChange={(e) => setAutoInterval(Number(e.target.value))}
                disabled={!autoEnabled || !isStreamActive}
                className="bg-gray-700 text-white text-xs rounded px-2 py-1 outline-none ml-auto disabled:opacity-40"
              >
                <option value={15}>15秒</option>
                <option value={30}>30秒</option>
                <option value={60}>60秒</option>
                <option value={120}>2分</option>
              </select>
            </div>
          </section>

          {/* ── 質問 ── */}
          <section className="space-y-2">
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
              AIに質問
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  !e.nativeEvent.isComposing &&
                  handleSend()
                }
                placeholder="質問を入力..."
                className="flex-1 bg-gray-700/80 text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                disabled={chatProcessing}
              />
              <button
                onClick={handleSend}
                disabled={chatProcessing || !userInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm transition-colors"
              >
                送信
              </button>
            </div>
          </section>

          <hr className="border-gray-700/50" />

          {/* ── AIサービス ── */}
          <section className="space-y-3">
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
              AI設定
            </h3>
            <div>
              <label className="block text-gray-300 text-xs mb-1">
                サービス
              </label>
              <select
                value={aiService}
                onChange={(e) => setAiService(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none"
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="google">Google Gemini</option>
                <option value="groq">Groq</option>
              </select>
            </div>
            <div>
              <label className="block text-gray-300 text-xs mb-1">モデル</label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder="例: gpt-4o"
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none placeholder-gray-500"
              />
              <p className="text-gray-600 text-xs mt-1">
                ※ マルチモーダル対応モデル推奨
              </p>
            </div>
            <div>
              <label className="block text-gray-300 text-xs mb-1">
                APIキー
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none placeholder-gray-500"
              />
            </div>
          </section>

          {/* ── 音声 ── */}
          <section className="space-y-2">
            <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider">
              音声エンジン
            </h3>
            <select
              value={voiceEngine}
              onChange={(e) => setVoiceEngine(e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none"
            >
              <option value="openai">OpenAI TTS</option>
              <option value="voicevox">VOICEVOX（ローカル）</option>
              <option value="aivis_speech">AivisSpeech（ローカル）</option>
              <option value="google">Google TTS</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </section>

          <button
            onClick={saveSettings}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            保存
          </button>
        </div>
      </div>

      {/* ドロワー外クリックで閉じる */}
      {panelOpen && (
        <div
          className="absolute inset-0 z-10"
          onClick={() => setPanelOpen(false)}
        />
      )}

      {/* デバッグ: チャットログモーダル */}
      {debugOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-[600px] max-w-[90vw] max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
              <span className="text-yellow-400 font-bold text-sm">
                🐛 チャットログ（デバッグ）
              </span>
              <button
                onClick={() => setDebugOpen(false)}
                className="text-gray-400 hover:text-white text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-xs">
              {chatLog.length === 0 ? (
                <p className="text-gray-500">メッセージなし</p>
              ) : (
                chatLog.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded px-3 py-2 whitespace-pre-wrap break-all ${
                      msg.role === 'system'
                        ? 'bg-purple-900/40 text-purple-300'
                        : msg.role === 'user'
                          ? 'bg-blue-900/40 text-blue-200'
                          : 'bg-gray-800 text-gray-200'
                    }`}
                  >
                    <span className="font-bold mr-2 opacity-60">
                      [{msg.role}]
                    </span>
                    {getMessageText(msg.content)}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <Toasts />
    </div>
  )
}
