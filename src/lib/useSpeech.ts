"use client";
// Talk instead of type: the browser's built-in speech recognition (free, works in Chrome on Android).
import { useEffect, useRef, useState } from "react";

type Result = { 0: { transcript: string }; isFinal: boolean };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: { resultIndex: number; results: ArrayLike<Result> }) => void;
  onend: () => void;
  onerror: () => void;
  start: () => void;
  stop: () => void;
};
type Ctor = new () => Recognition;

export function useSpeech(onText: (finalText: string, interim: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cb = useRef(onText);
  cb.current = onText;

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);

  function start() {
    const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
    const R = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!R) return;
    const r = new R();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let fin = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) fin += res[0].transcript;
        else interim += res[0].transcript;
      }
      cb.current(fin, interim);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  }

  const stop = () => rec.current?.stop();
  return { supported, listening, start, stop };
}
