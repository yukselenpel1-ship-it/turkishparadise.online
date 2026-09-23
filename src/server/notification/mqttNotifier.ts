export interface RoomStateUpdateNotification {
  type: 'ROOM_STATE_UPDATED';
  roomId: string;
  version: number;
  updatedAt: number;
}

export type NotificationListener = (notification: RoomStateUpdateNotification) => void;

const testListeners = new Set<NotificationListener>();

/**
 * Register a listener for test/in-memory verification
 */
export function registerNotificationListener(listener: NotificationListener): () => void {
  testListeners.add(listener);
  return () => {
    testListeners.delete(listener);
  };
}

/**
 * Clear all test listeners
 */
export function clearNotificationListeners(): void {
  testListeners.clear();
}

/**
 * Broadcasts a lightweight ROOM_STATE_UPDATED notification to all room subscribers.
 * 
 * 🔒 SECURITY GUARANTEE:
 * - Never publishes sensitive full game state or player money over public MQTT.
 * - Clients only receive the notification that a new canonical version is available,
 *   and pull the verified state via GET /api/game/state?roomId=...
 */
export async function publishRoomStateUpdateNotification(
  roomId: string,
  version: number,
  updatedAt = Date.now()
): Promise<void> {
  const cleanId = (roomId || '').trim().toUpperCase();
  if (!cleanId) return;

  const payload: RoomStateUpdateNotification = {
    type: 'ROOM_STATE_UPDATED',
    roomId: cleanId,
    version,
    updatedAt
  };

  // 1. Notify local in-memory/test listeners
  testListeners.forEach(listener => {
    try {
      listener(payload);
    } catch (e) {
      console.warn('[Notifier] Listener error:', e);
    }
  });

  // 2. In production serverless: If an external HTTP MQTT bridge or Webhook URL is configured
  const webhookUrl = process.env.MQTT_NOTIFIER_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: `turkishparadise/rooms/${cleanId.toLowerCase()}`,
          message: payload
        })
      }).catch(err => {
        console.warn('[Notifier] Webhook broadcast non-blocking error:', err?.message || err);
      });
    } catch (err) {
      console.warn('[Notifier] Broadcast exception:', err);
    }
  }
}
