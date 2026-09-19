import mqtt, { MqttClient } from 'mqtt';
import { GameState, Player, ChatMessage, TradeOffer } from '../types/game';

// Unique client session ID
export const LOCAL_CLIENT_ID = `client_${Math.random().toString(36).substring(2, 11)}`;

// Public WebSocket MQTT Brokers (Free, Global, SSL encrypted, zero token needed)
const BROKER_URLS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt'
];

type SyncMessage =
  | { type: 'STATE_SYNC'; senderId: string; roomId: string; version: number; state: GameState }
  | { type: 'JOIN_REQUEST'; senderId: string; roomId: string; player: Player }
  | { type: 'LEAVE_NOTICE'; senderId: string; roomId: string; playerId: string }
  | { type: 'REQUEST_SYNC'; senderId: string; roomId: string }
  | { type: 'CHAT_MESSAGE'; senderId: string; roomId: string; message: ChatMessage }
  | { type: 'TRADE_OFFER'; senderId: string; roomId: string; offer: TradeOffer };

type MessageCallback = (msg: SyncMessage) => void;

class MultiplayerSyncManager {
  private client: MqttClient | null = null;
  private currentRoomId: string | null = null;
  private localChannel: BroadcastChannel | null = null;
  private listeners: Set<MessageCallback> = new Set();
  private isConnected = false;
  private currentBrokerIndex = 0;
  private currentVersion = 0;

  constructor() {
    // Setup local BroadcastChannel for same-device tab communication
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.localChannel = new BroadcastChannel('tp_global_multiplayer_channel');
        this.localChannel.onmessage = (event) => {
          if (event.data) {
            this.notifyListeners(event.data);
          }
        };
      }
    } catch (e) {
      console.warn('[Sync] BroadcastChannel unsupported:', e);
    }
  }

  /**
   * Connect to MQTT WebSocket broker and subscribe to room
   */
  public joinRoom(roomId: string, onMessage: MessageCallback): () => void {
    const cleanRoomId = roomId.trim().toUpperCase();
    this.currentRoomId = cleanRoomId;
    this.listeners.add(onMessage);

    this.ensureConnection();

    // Send a sync request to ask the host for current game state upon joining
    setTimeout(() => {
      this.send({
        type: 'REQUEST_SYNC',
        senderId: LOCAL_CLIENT_ID,
        roomId: cleanRoomId
      });
    }, 500);

    // Return unbind function
    return () => {
      this.listeners.delete(onMessage);
    };
  }

  /**
   * Send state or message to everyone in the room
   */
  public broadcastState(roomId: string, state: GameState): void {
    this.currentVersion++;
    const msg: SyncMessage = {
      type: 'STATE_SYNC',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      version: this.currentVersion,
      state
    };
    this.send(msg);
  }

  /**
   * Send player join request to room host
   */
  public sendJoinRequest(roomId: string, player: Player): void {
    const msg: SyncMessage = {
      type: 'JOIN_REQUEST',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      player
    };
    this.send(msg);
  }

  /**
   * Send custom sync message over all active transports
   */
  public send(msg: SyncMessage): void {
    const topic = `turkishparadise/rooms/${msg.roomId.toLowerCase()}`;
    const payload = JSON.stringify(msg);

    // 1. BroadcastChannel (instant local)
    if (this.localChannel) {
      try {
        this.localChannel.postMessage(msg);
      } catch (e) {
        console.warn('[Sync] Local broadcast error:', e);
      }
    }

    // 2. MQTT WebSocket (Internet global)
    if (this.client && this.isConnected) {
      try {
        this.client.publish(topic, payload, { qos: 1 });
      } catch (err) {
        console.warn('[Sync] MQTT Publish error:', err);
      }
    }
  }

  private ensureConnection(): void {
    if (this.client && (this.isConnected || this.client.reconnecting)) {
      if (this.currentRoomId) {
        const topic = `turkishparadise/rooms/${this.currentRoomId.toLowerCase()}`;
        this.client.subscribe(topic, { qos: 1 });
      }
      return;
    }

    const brokerUrl = BROKER_URLS[this.currentBrokerIndex % BROKER_URLS.length];
    const clientId = `tp_${LOCAL_CLIENT_ID}`;

    try {
      this.client = mqtt.connect(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 3000,
        keepalive: 30
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log(`[Sync] Connected to global relay broker: ${brokerUrl}`);
        if (this.currentRoomId) {
          const topic = `turkishparadise/rooms/${this.currentRoomId.toLowerCase()}`;
          this.client?.subscribe(topic, { qos: 1 });
        }
      });

      this.client.on('message', (topic, message) => {
        try {
          const parsed = JSON.parse(message.toString()) as SyncMessage;
          // Ignore own messages from MQTT to avoid echo
          if (parsed.senderId === LOCAL_CLIENT_ID) return;
          this.notifyListeners(parsed);
        } catch (e) {
          console.warn('[Sync] Message parse error:', e);
        }
      });

      this.client.on('error', (err) => {
        console.warn(`[Sync] MQTT connection error with ${brokerUrl}:`, err);
        this.isConnected = false;
        // Try fallback broker
        this.currentBrokerIndex++;
      });

      this.client.on('offline', () => {
        this.isConnected = false;
      });
    } catch (e) {
      console.warn('[Sync] Failed to initialize MQTT client:', e);
    }
  }

  private notifyListeners(msg: SyncMessage): void {
    if (!this.currentRoomId) return;
    if (msg.roomId && msg.roomId.toUpperCase() !== this.currentRoomId.toUpperCase()) return;
    this.listeners.forEach((callback) => {
      try {
        callback(msg);
      } catch (err) {
        console.error('[Sync] Listener error:', err);
      }
    });
  }
}

export const syncManager = new MultiplayerSyncManager();
