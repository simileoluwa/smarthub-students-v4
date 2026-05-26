import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isGuiltFree,
  shouldBlockNotification,
  validatePayloadSize,
  sendNotification,
  NotificationPayload,
  BatteryStatus,
  FORBIDDEN_WORDS
} from '../tools/notification';

describe('Notification Engine & Battery-Lock (SOP-005)', () => {
  describe('Zero Guilt-Tripping Policy (isGuiltFree)', () => {
    it('should permit positive, encouraging academic notifications', () => {
      const positiveTexts = [
        'PHY111: 12 cards are ready for a quick recall session when you have a free moment.',
        'Semester timeline updated: We adjusted your targets to fit the new calendar.',
        'Great job on your study session today! Click here to review MTH101.',
        'New shared deck from Tunde: General Physics I.'
      ];

      for (const text of positiveTexts) {
        expect(isGuiltFree(text)).toBe(true);
      }
    });

    it('should block and reject notifications containing forbidden guilt triggers', () => {
      for (const word of FORBIDDEN_WORDS) {
        const text = `Do not be lazy! You will fail unless you avoid this consequence. ${word.toUpperCase()}!`;
        expect(isGuiltFree(text)).toBe(false);
      }
    });

    it('should be case-insensitive when screening for guilt-based phrasing', () => {
      expect(isGuiltFree('Do not lose your STREAK!').valueOf()).toBe(false);
      expect(isGuiltFree('You look LAZY today.').valueOf()).toBe(false);
      expect(isGuiltFree('We are disappointed with your effort.').valueOf()).toBe(false);
    });
  });

  describe('Battery and Power Considerations (shouldBlockNotification)', () => {
    it('should block notification dispatches if battery level is below 15% (0.15) and NOT charging', () => {
      const lowBatteryNotCharging: BatteryStatus = { level: 0.14, charging: false };
      const criticallyLowBattery: BatteryStatus = { level: 0.05, charging: false };

      expect(shouldBlockNotification(lowBatteryNotCharging)).toBe(true);
      expect(shouldBlockNotification(criticallyLowBattery)).toBe(true);
    });

    it('should permit notification dispatches if battery is below 15% but IS charging', () => {
      const lowBatteryAndCharging: BatteryStatus = { level: 0.10, charging: true };
      const criticallyLowBatteryAndCharging: BatteryStatus = { level: 0.02, charging: true };

      expect(shouldBlockNotification(lowBatteryAndCharging)).toBe(false);
      expect(shouldBlockNotification(criticallyLowBatteryAndCharging)).toBe(false);
    });

    it('should permit notification dispatches if battery is above or equal to 15% (0.15) regardless of charging status', () => {
      const healthyBatteryNotCharging: BatteryStatus = { level: 0.15, charging: false };
      const highBatteryNotCharging: BatteryStatus = { level: 0.80, charging: false };
      const healthyBatteryCharging: BatteryStatus = { level: 0.15, charging: true };
      const highBatteryCharging: BatteryStatus = { level: 0.95, charging: true };

      expect(shouldBlockNotification(healthyBatteryNotCharging)).toBe(false);
      expect(shouldBlockNotification(highBatteryNotCharging)).toBe(false);
      expect(shouldBlockNotification(healthyBatteryCharging)).toBe(false);
      expect(shouldBlockNotification(highBatteryCharging)).toBe(false);
    });
  });

  describe('Bandwidth Size Constraints (validatePayloadSize)', () => {
    it('should accept typical, dry, raw academic payloads under 2KB', () => {
      const validPayload: NotificationPayload = {
        title: 'MTH101 Study Session',
        body: 'Your study plan is updated. Click to begin your daily revision.',
        data: { courseId: 'mth101-uuid' }
      };

      expect(validatePayloadSize(validPayload)).toBe(true);
    });

    it('should reject heavy or bloated payloads that exceed the 2KB (2048 bytes) packet size boundary', () => {
      // Create a large body to exceed 2KB limit
      const oversizedBody = 'A'.repeat(2050);
      const bloatedPayload: NotificationPayload = {
        title: 'Bloated Payload Alert',
        body: oversizedBody
      };

      expect(validatePayloadSize(bloatedPayload)).toBe(false);
    });

    it('should handle complex payload objects and accurately measure UTF-8 byte length', () => {
      // Create a payload that is close to the limit (e.g. 2000 characters of high-byte Unicode emojis)
      const unicodeString = '🎓📚🌟'.repeat(200); // 3 emojis * 4 bytes each = 12 bytes * 200 = 2400 bytes
      const emojiPayload: NotificationPayload = {
        title: 'Unicode Alert',
        body: unicodeString
      };

      expect(validatePayloadSize(emojiPayload)).toBe(false);
    });
  });

  describe('Integrated Notification Dispatcher (sendNotification)', () => {
    const normalBattery: BatteryStatus = { level: 0.50, charging: false };
    const lowBattery: BatteryStatus = { level: 0.10, charging: false };

    it('should successfully pass normal compliant notifications', async () => {
      const payload: NotificationPayload = {
        title: 'PHY111 Recall Session',
        body: '12 cards are ready for a quick recall session when you have a free moment.'
      };

      const result = await sendNotification(payload, normalBattery);
      expect(result.success).toBe(true);
      expect(result.blockedReason).toBeUndefined();
    });

    it('should fail and report guilt block when payload contains forbidden words', async () => {
      const badPayload: NotificationPayload = {
        title: 'Study Now!',
        body: 'If you fail to study, your grades will suffer and you will break your streak.'
      };

      const result = await sendNotification(badPayload, normalBattery);
      expect(result.success).toBe(false);
      expect(result.blockedReason).toBe('GUILT_FILTER');
    });

    it('should fail and report battery block when device has low battery and is not charging', async () => {
      const payload: NotificationPayload = {
        title: 'PHY111 Recall Session',
        body: '12 cards are ready for a quick recall session when you have a free moment.'
      };

      const result = await sendNotification(payload, lowBattery);
      expect(result.success).toBe(false);
      expect(result.blockedReason).toBe('BATTERY_LOCK');
    });

    it('should fail and report oversized block when payload exceeds the 2KB limit', async () => {
      const oversizedPayload: NotificationPayload = {
        title: 'PHY111 Session',
        body: 'X'.repeat(2100)
      };

      const result = await sendNotification(oversizedPayload, normalBattery);
      expect(result.success).toBe(false);
      expect(result.blockedReason).toBe('OVERSIZED_PAYLOAD');
    });
  });
});
