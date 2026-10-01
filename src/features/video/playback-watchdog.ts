export interface RecoveryPreferences {
  enabled: boolean;
  stallSeconds: number;
  retrySeconds: number;
  maxAttempts: number;
}

export const DEFAULT_RECOVERY_PREFERENCES: RecoveryPreferences = { enabled: false, stallSeconds: 20, retrySeconds: 30, maxAttempts: 3 };

export function normalizeRecoveryPreferences(value?: Partial<RecoveryPreferences>): RecoveryPreferences {
  const bounded = (raw: unknown, fallback: number, min: number, max: number) =>
    typeof raw === "number" && Number.isFinite(raw) ? Math.round(Math.max(min, Math.min(max, raw))) : fallback;
  return {
    enabled: value?.enabled === true,
    stallSeconds: bounded(value?.stallSeconds, 20, 10, 120),
    retrySeconds: bounded(value?.retrySeconds, 30, 5, 300),
    maxAttempts: bounded(value?.maxAttempts, 3, 1, 10),
  };
}

interface Sample { key: number; time?: number; frames?: number; blocked: boolean }
export type RecoveryEvent = "retry" | "exhausted" | "recovered";

export class PlaybackWatchdog {
  private previous: Sample | undefined;
  private lastProgressAt = 0;
  private stableSince: number | undefined;
  private hasPlayed = false;
  private attempts = 0;
  private nextAttemptAt = 0;
  private exhausted = false;

  reset(keepPlayed = false) {
    this.previous = undefined;
    this.lastProgressAt = 0;
    this.stableSince = undefined;
    if (!keepPlayed) this.hasPlayed = false;
    this.attempts = 0;
    this.nextAttemptAt = 0;
    this.exhausted = false;
  }

  tick(now: number, sample: Sample, preferences: RecoveryPreferences): RecoveryEvent | undefined {
    if (!preferences.enabled) { this.reset(); return; }
    const previous = this.previous;
    this.previous = sample;
    if (!previous || sample.blocked || previous.blocked || previous.key !== sample.key) {
      this.lastProgressAt = now;
      this.stableSince = undefined;
      return;
    }
    const progressed = (sample.time !== undefined && previous.time !== undefined && sample.time > previous.time + 0.01)
      || (sample.frames !== undefined && previous.frames !== undefined && sample.frames > previous.frames);
    if (progressed) {
      this.hasPlayed = true;
      this.lastProgressAt = now;
      this.stableSince ??= now;
      if (this.attempts && now - this.stableSince >= 5000) {
        this.attempts = 0;
        this.nextAttemptAt = 0;
        this.exhausted = false;
        return "recovered";
      }
      return;
    }
    this.stableSince = undefined;
    if (!this.hasPlayed || this.exhausted || now - this.lastProgressAt < preferences.stallSeconds * 1000 || now < this.nextAttemptAt) return;
    if (this.attempts >= preferences.maxAttempts) { this.exhausted = true; return "exhausted"; }
    this.attempts++;
    this.nextAttemptAt = now + preferences.retrySeconds * 1000 * Math.min(8, 2 ** (this.attempts - 1));
    this.lastProgressAt = now;
    return "retry";
  }
}
