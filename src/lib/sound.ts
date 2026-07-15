/// Subtle two-tone notification chime using the Web Audio API.
/// No audio files needed — synthesized programmatically.
///
/// Uses a lazy singleton AudioContext to avoid autoplay policy issues
/// in Tauri webviews (context created after first user gesture is already resumed).

const STORAGE_KEY = "splice:soundMuted";

let _ctx: AudioContext | null = null;
let _lastChime = 0;

// Initialize from localStorage — falls back to false (unmuted) in SSR/test environments
let _muted: boolean;
try {
  _muted = localStorage.getItem(STORAGE_KEY) === "true";
} catch {
  _muted = false;
}

function getCtx(): AudioContext | null {
  try {
    if (!_ctx) _ctx = new AudioContext();
    if (_ctx.state === "suspended") {
      _ctx.resume();
    }
    return _ctx;
  } catch {
    return null;
  }
}

/// Check whether the notification sound is muted.
export function isSoundMuted(): boolean {
  return _muted;
}

/// Mute or unmute the notification sound. Persists to localStorage.
export function setSoundMuted(muted: boolean): void {
  _muted = muted;
  try {
    localStorage.setItem(STORAGE_KEY, muted ? "true" : "false");
  } catch {
    // localStorage unavailable — silently ignore
  }
}

/// Reset sound settings to defaults (unmuted). Clears persisted state.
export function resetSoundSettings(): void {
  _muted = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}

/// Play a subtle ascending chime (C5 → E5).
/// Debounced: if called more than once within 600ms, only the first call plays.
/// No-op when muted.
export function playConflictChime(): void {
  if (_muted) return;
  const now = Date.now();
  if (now - _lastChime < 600) return;
  _lastChime = now;

  const ctx = getCtx();
  if (!ctx) return;

  const gain = ctx.createGain();
  gain.connect(ctx.destination);

  // Keep the audio very subtle
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.12, 0.04);
  gain.gain.linearRampToValueAtTime(0.10, 0.12);
  gain.gain.linearRampToValueAtTime(0, 0.35);

  // First tone: C5 (523 Hz) — short, soft
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.setValueAtTime(523, 0);
  osc1.connect(gain);
  osc1.start(0);
  osc1.stop(0.16);

  // Second tone: E5 (659 Hz) — slightly overlapping
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.setValueAtTime(659, 0.10);
  osc2.connect(gain);
  osc2.start(0.10);
  osc2.stop(0.35);

  // Let the AudioContext stay alive; it will be reused on next call
}
