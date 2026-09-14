let audioContext: AudioContext | null = null;
let preCachedAudio: HTMLAudioElement | null = null;
let speechPrimed = false;

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";

const getAudioContext = (): AudioContext => {
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContext();
  }
  return audioContext;
};

// --- Re-unlock on EVERY user gesture (no single-fire guard) ---
const unlockAudio = async () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    // Play silent buffer to fully unlock
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    // ignore
  }

  // Pre-cache an Audio element on gesture so it can be reused programmatically
  if (!preCachedAudio) {
    try {
      preCachedAudio = new Audio(SILENT_WAV);
      preCachedAudio.volume = 0;
      await preCachedAudio.play().catch(() => {});
    } catch {
      // ignore
    }
  }

  // Prime speechSynthesis with a silent utterance
  if (!speechPrimed && "speechSynthesis" in window) {
    try {
      const silent = new SpeechSynthesisUtterance("");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);
      speechPrimed = true;
    } catch {
      // ignore
    }
  }
};

if (typeof document !== "undefined") {
  const handler = () => { unlockAudio(); };
  document.addEventListener("click", handler, { passive: true });
  document.addEventListener("touchstart", handler, { passive: true });
}

// --- Exported: re-resume context right before playing ---
export const ensureAudioReady = async (): Promise<boolean> => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    return ctx.state === "running";
  } catch {
    return false;
  }
};

// --- Fallback: HTML5 Audio from generated WAV blob ---
const playFallbackBeep = () => {
  // Try pre-cached element first
  if (preCachedAudio) {
    try {
      preCachedAudio.src = "";
      const sampleRate = 8000;
      const duration = 0.3;
      const numSamples = Math.floor(sampleRate * duration);
      const buffer = new ArrayBuffer(44 + numSamples * 2);
      const view = new DataView(buffer);
      const writeStr = (offset: number, s: string) => {
        for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
      };
      writeStr(0, "RIFF");
      view.setUint32(4, 36 + numSamples * 2, true);
      writeStr(8, "WAVE");
      writeStr(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, "data");
      view.setUint32(40, numSamples * 2, true);
      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const sample = Math.sin(2 * Math.PI * 660 * t) * 0.4;
        view.setInt16(44 + i * 2, sample * 32767, true);
      }
      const blob = new Blob([buffer], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      preCachedAudio.src = url;
      preCachedAudio.volume = 0.5;
      preCachedAudio.play().catch(() => {});
      preCachedAudio.onended = () => URL.revokeObjectURL(url);
      return;
    } catch {
      // fall through
    }
  }

  // Last resort: new Audio element
  try {
    const sampleRate = 8000;
    const duration = 0.3;
    const numSamples = Math.floor(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const writeStr = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + numSamples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, numSamples * 2, true);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * 660 * t) * 0.4;
      view.setInt16(44 + i * 2, sample * 32767, true);
    }
    const blob = new Blob([buffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 0.5;
    audio.play().catch(() => {});
    audio.onended = () => URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
};

// --- Base64 data-URL playback via WebAudio (bypasses HTMLMediaElement autoplay policy) ---
let currentSource: AudioBufferSourceNode | null = null;
let currentFallbackAudio: HTMLAudioElement | null = null;

const decodeBase64 = (b64: string): ArrayBuffer => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

export const stopBase64Audio = () => {
  try { currentSource?.stop(); } catch { /* ignore */ }
  currentSource = null;
  try { currentFallbackAudio?.pause(); } catch { /* ignore */ }
  currentFallbackAudio = null;
};

export const playBase64Audio = async (dataUrl: string, onEnd?: () => void): Promise<void> => {
  if (!dataUrl) { onEnd?.(); return; }
  const commaIdx = dataUrl.indexOf(",");
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  stopBase64Audio();
  await ensureAudioReady();
  const ctx = getAudioContext();

  if (ctx.state === "running") {
    try {
      const arrayBuf = decodeBase64(b64);
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(ctx.destination);
      src.onended = () => { if (currentSource === src) currentSource = null; onEnd?.(); };
      src.start(0);
      currentSource = src;
      return;
    } catch (err) {
      console.error("[audio] WebAudio playback failed, falling back to HTMLAudio:", err);
    }
  } else {
    console.warn("[audio] AudioContext not running (state=" + ctx.state + "), using HTMLAudio fallback");
  }

  // Fallback: HTMLMediaElement (may be blocked by autoplay policy in iframes)
  try {
    const audio = new Audio(dataUrl);
    currentFallbackAudio = audio;
    audio.onended = () => { if (currentFallbackAudio === audio) currentFallbackAudio = null; onEnd?.(); };
    audio.onerror = () => {
      console.error("[audio] HTMLAudio fallback error");
      if (currentFallbackAudio === audio) currentFallbackAudio = null;
      onEnd?.();
    };
    await audio.play();
  } catch (err) {
    console.error("[audio] HTMLAudio fallback play() rejected:", err);
    onEnd?.();
  }
};

export const playChime = async () => {
  await ensureAudioReady();
  const ctx = getAudioContext();

  // If still suspended, use fallback
  if (ctx.state !== "running") {
    playFallbackBeep();
    return;
  }

  const now = ctx.currentTime;

  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = "sine";
  osc1.frequency.value = 523;
  gain1.gain.setValueAtTime(0.4, now);
  gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
  osc1.connect(gain1).connect(ctx.destination);
  osc1.start(now);
  osc1.stop(now + 0.4);

  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = "sine";
  osc2.frequency.value = 659;
  gain2.gain.setValueAtTime(0.4, now + 0.25);
  gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.7);
  osc2.connect(gain2).connect(ctx.destination);
  osc2.start(now + 0.25);
  osc2.stop(now + 0.7);

  const osc3 = ctx.createOscillator();
  const gain3 = ctx.createGain();
  osc3.type = "sine";
  osc3.frequency.value = 784;
  gain3.gain.setValueAtTime(0.35, now + 0.5);
  gain3.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
  osc3.connect(gain3).connect(ctx.destination);
  osc3.start(now + 0.5);
  osc3.stop(now + 1.0);
};

// Loud, attention-grabbing alert: 3 chime bursts at high gain, then a voice line.
// Used for explicit user-set reminders (appointments at their selected alert time).
export const playLoudAlertSequence = async (message?: string) => {
  await ensureAudioReady();
  const ctx = getAudioContext();

  if (ctx.state !== "running") {
    // Fallback path: multiple beeps
    for (let i = 0; i < 4; i++) {
      setTimeout(() => playFallbackBeep(), i * 600);
    }
    if (message && "speechSynthesis" in window) {
      setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(message);
          u.volume = 1.0;
          u.rate = 0.95;
          window.speechSynthesis.speak(u);
        } catch {
          // ignore
        }
      }, 4 * 600 + 200);
    }
    return;
  }

  const playBurst = (startOffset: number) => {
    const now = ctx.currentTime + startOffset;
    const tones = [
      { freq: 880, t: 0.0, dur: 0.35 },
      { freq: 988, t: 0.18, dur: 0.4 },
      { freq: 1175, t: 0.36, dur: 0.5 },
    ];
    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.9, now + tone.t);
      gain.gain.exponentialRampToValueAtTime(0.01, now + tone.t + tone.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + tone.t);
      osc.stop(now + tone.t + tone.dur);
    }
  };

  // 3 bursts ~1.2s apart
  playBurst(0);
  playBurst(1.2);
  playBurst(2.4);

  if (message && "speechSynthesis" in window) {
    const speakAt = 3.7 * 1000;
    setTimeout(() => {
      try {
        window.speechSynthesis.cancel();
        const silent = new SpeechSynthesisUtterance("");
        silent.volume = 0;
        window.speechSynthesis.speak(silent);
        const u = new SpeechSynthesisUtterance(message);
        u.rate = 0.95;
        u.pitch = 1.0;
        u.volume = 1.0;
        window.speechSynthesis.speak(u);
      } catch {
        // ignore
      }
    }, speakAt);
  } else {
    // No speech available — add a 4th burst
    playBurst(3.6);
  }
};

export const speak = async (message: string): Promise<void> => {
  await ensureAudioReady();
  if (!("speechSynthesis" in window)) return;
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const silent = new SpeechSynthesisUtterance("");
      silent.volume = 0;
      window.speechSynthesis.speak(silent);

      const u = new SpeechSynthesisUtterance(message);
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
};

export const stopSpeaking = () => {
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  } catch {
    // ignore
  }
};

export const playVoiceReminder = async (message = "It's time for your Check-iN") => {
  await ensureAudioReady();
  if (!("speechSynthesis" in window)) {
    playChime();
    return;
  }
  window.speechSynthesis.cancel();

  // Re-prime with silent utterance before real message
  const silent = new SpeechSynthesisUtterance("");
  silent.volume = 0;
  window.speechSynthesis.speak(silent);

  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.9;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
};

export const showBrowserNotification = (
  title: string,
  bodyOrOptions: string | (NotificationOptions & { vibrate?: number[] })
) => {
  if (!("Notification" in window)) return;
  const opts: NotificationOptions =
    typeof bodyOrOptions === "string"
      ? { body: bodyOrOptions, icon: "/favicon.ico" }
      : ({ icon: "/favicon.ico", ...bodyOrOptions } as NotificationOptions);

  const show = () => {
    try {
      new Notification(title, opts);
    } catch {
      // ignore
    }
  };

  if (Notification.permission === "granted") {
    show();
  } else if (Notification.permission !== "denied") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") show();
    });
  }
};
