import { Talk } from './messages'

export async function synthesizeVoiceBrowserApi(
  talk: Talk,
  lang: string
): Promise<null> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error('このブラウザはWeb Speech APIに対応していません')
  }

  await new Promise<void>((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(talk.message)
    utterance.lang = lang
    utterance.onend = () => resolve()
    utterance.onerror = (e) => {
      // interrupted は停止操作なので正常終了扱い
      if (e.error === 'interrupted') {
        resolve()
      } else {
        reject(new Error(`SpeechSynthesis error: ${e.error}`))
      }
    }
    window.speechSynthesis.speak(utterance)
  })

  // null を返すことで speakCharacter 側に「直接再生済み」を通知
  return null
}
