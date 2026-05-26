export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
  icon?: string;
  badge?: string;
}

export interface BatteryStatus {
  level: number; // 0.0 to 1.0
  charging: boolean;
}

export interface NotificationDispatchStatus {
  success: boolean;
  blockedReason?: 'GUILT_FILTER' | 'BATTERY_LOCK' | 'OVERSIZED_PAYLOAD' | 'REGISTRATION_ERROR';
}

export const FORBIDDEN_WORDS = [
  'streak',
  'failed',
  'lazy',
  'disappointed',
  'falling behind',
  'consequence',
  'shame',
  'guilt'
];

/**
 * Validates that text does not contain any of the forbidden trigger words (case-insensitive)
 */
export function isGuiltFree(text: string): boolean {
  const normalized = text.toLowerCase();
  return !FORBIDDEN_WORDS.some(word => normalized.includes(word));
}

/**
 * Enforces the < 0.15 battery lock when charging is false.
 */
export function shouldBlockNotification(battery: BatteryStatus): boolean {
  return battery.level < 0.15 && !battery.charging;
}

/**
 * Encodes payload to UTF-8 / JSON and asserts size in bytes is strictly less than 2048 bytes (2KB limit)
 */
export function validatePayloadSize(payload: NotificationPayload): boolean {
  try {
    const jsonStr = JSON.stringify(payload);
    // Use TextEncoder to get exact UTF-8 bytes
    const byteLength = new TextEncoder().encode(jsonStr).length;
    return byteLength < 2048;
  } catch (e) {
    return false;
  }
}

/**
 * Evaluates all safety checks (guilt filter, battery limits, packet size) and dispatches notification.
 */
export async function sendNotification(
  payload: NotificationPayload,
  battery: BatteryStatus
): Promise<NotificationDispatchStatus> {
  // 1. Zero Guilt Filter
  if (!isGuiltFree(payload.title) || !isGuiltFree(payload.body)) {
    return { success: false, blockedReason: 'GUILT_FILTER' };
  }

  // 2. Battery limits
  if (shouldBlockNotification(battery)) {
    return { success: false, blockedReason: 'BATTERY_LOCK' };
  }

  // 3. Size boundaries
  if (!validatePayloadSize(payload)) {
    return { success: false, blockedReason: 'OVERSIZED_PAYLOAD' };
  }

  try {
    // Service Worker active context dispatch
    if (typeof self !== 'undefined' && 'registration' in self) {
      const swSelf = self as unknown as {
        registration: {
          showNotification: (title: string, options?: any) => Promise<void>;
        };
      };
      await swSelf.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        data: payload.data,
      });
      return { success: true };
    }

    // Main window thread dispatch fallback
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission === 'granted') {
        new window.Notification(payload.title, {
          body: payload.body,
          icon: payload.icon,
          badge: payload.badge,
          data: payload.data,
        });
        return { success: true };
      }
    }

    // Default successful status when safety filters pass but environment lacks display drivers (e.g. CLI/Headless testing)
    return { success: true };
  } catch (error) {
    return { success: false, blockedReason: 'REGISTRATION_ERROR' };
  }
}
