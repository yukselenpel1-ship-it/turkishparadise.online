import mqtt, { MqttClient } from 'mqtt';
import Peer, { DataConnection } from 'peerjs';
import { GameState, Player, ChatMessage, TradeOffer } from '../types/game';

// Unique client session ID
export const LOCAL_CLIENT_ID = `client_${Math.random().toString(36).substring(2, 11)}`;

// Public WebSocket MQTT Brokers (Free, Global, SSL encrypted, zero token needed)
const BROKER_URLS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt'
];

export type SyncMessage =
  | { type: 'STATE_SYNC'; senderId: string; roomId: string; version: number; state: GameState }
  | { type: 'JOIN_REQUEST'; senderId: string; roomId: string; player: Player }
  | { type: 'LEAVE_NOTICE'; senderId: string; roomId: string; playerId: string }
  | { type: 'HOST_MIGRATED'; senderId: string; roomId: string; newHostPlayerId: string }
  | { type: 'REQUEST_SYNC'; senderId: string; roomId: string; playerId?: string }
  | { type: 'CHAT_MESSAGE'; senderId: string; roomId: string; message: ChatMessage }
  | { type: 'TRADE_OFFER'; senderId: string; roomId: string; offer: TradeOffer }
  | { type: 'GAME_ACTION'; senderId: string; roomId: string; playerId: string; actionType: string; payload?: any };

export type MessageCallback = (msg: SyncMessage) => void;

class MultiplayerSyncManager {
  private mqttClient: MqttClient | null = null;
  private peer: Peer | null = null;
  private peerConnections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private currentRoomId: string | null = null;
  private localChannel: BroadcastChannel | null = null;
  private listeners: Set<MessageCallback> = new Set();
  private friendListeners: Set<(data: any) => void> = new Set();
  private isMqttConnected = false;
  private isHost = false;
  private currentVersion = 0;
  private brokerIndex = 0;

  constructor() {
    // 1. Setup local BroadcastChannel for multi-tab on same machine
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.localChannel = new BroadcastChannel('tp_global_multiplayer_channel');
        this.localChannel.onmessage = (event) => {
          if (event.data && event.data.senderId !== LOCAL_CLIENT_ID) {
            this.notifyListeners(event.data);
          }
        };
      }
    } catch (e) {
      console.warn('[Sync] BroadcastChannel unsupported:', e);
    }
  }

  /**
   * Initialize and join room over WebRTC (PeerJS) & MQTT WebSocket
   */
  public joinRoom(roomId: string, onMessage: MessageCallback, isHostRole = false): () => void {
    const cleanRoomId = roomId.trim().toUpperCase();
    this.currentRoomId = cleanRoomId;
    this.isHost = isHostRole;
    this.listeners.add(onMessage);

    // 1. Connect MQTT WebSockets
    this.ensureMqttConnection();

    // 2. Setup PeerJS WebRTC P2P mesh
    this.initPeerJs(cleanRoomId);

    // 3. Request initial state from host
    setTimeout(() => {
      this.send({
        type: 'REQUEST_SYNC',
        senderId: LOCAL_CLIENT_ID,
        roomId: cleanRoomId
      });
    }, 400);

    return () => {
      this.listeners.delete(onMessage);
    };
  }

  /**
   * Setup PeerJS WebRTC Direct DataChannel
   */
  private initPeerJs(roomId: string) {
    try {
      // Clean peer room ID
      const safeRoomId = roomId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const hostPeerId = `tp-host-${safeRoomId}`;

      if (this.peer) {
        try {
          this.peer.destroy();
        } catch (e) {}
      }

      if (this.isHost) {
        // HOST: Register fixed host ID
        this.peer = new Peer(hostPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log(`[WebRTC] Host peer opened with ID: ${id}`);
        });

        this.peer.on('connection', (conn) => {
          console.log(`[WebRTC] Client connected to Host: ${conn.peer}`);
          this.peerConnections.set(conn.peer, conn);

          conn.on('data', (data) => {
            try {
              const msg = (typeof data === 'string' ? JSON.parse(data) : data) as SyncMessage;
              if (msg && msg.senderId !== LOCAL_CLIENT_ID) {
                this.notifyListeners(msg);
              }
            } catch (e) {
              console.warn('[WebRTC] Data parse error:', e);
            }
          });

          conn.on('close', () => {
            this.peerConnections.delete(conn.peer);
          });
        });

        this.peer.on('error', (err: any) => {
          console.warn('[WebRTC] Host peer error:', err);
          // If ID is already taken, connect as client
          if (err.type === 'unavailable-id') {
            this.isHost = false;
            this.initPeerJsClient(roomId, hostPeerId);
          }
        });
      } else {
        // CLIENT: Connect to host
        this.initPeerJsClient(roomId, hostPeerId);
      }
    } catch (e) {
      console.warn('[WebRTC] Failed to init PeerJS:', e);
    }
  }

  private initPeerJsClient(roomId: string, hostPeerId: string) {
    try {
      this.peer = new Peer(undefined as any, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      this.peer.on('open', (myPeerId) => {
        console.log(`[WebRTC] Client peer opened: ${myPeerId}, connecting to host: ${hostPeerId}`);
        const conn = this.peer!.connect(hostPeerId, { reliable: true });
        this.hostConnection = conn;

        conn.on('open', () => {
          console.log(`[WebRTC] Connected directly to host ${hostPeerId}!`);
          // Request sync immediately over WebRTC
          conn.send({
            type: 'REQUEST_SYNC',
            senderId: LOCAL_CLIENT_ID,
            roomId: roomId.toUpperCase()
          });
        });

        conn.on('data', (data) => {
          try {
            const msg = (typeof data === 'string' ? JSON.parse(data) : data) as SyncMessage;
            if (msg && msg.senderId !== LOCAL_CLIENT_ID) {
              this.notifyListeners(msg);
            }
          } catch (e) {
            console.warn('[WebRTC] Client data parse error:', e);
          }
        });
      });

      this.peer.on('error', (err) => {
        console.warn('[WebRTC] Client peer error:', err);
      });
    } catch (e) {
      console.warn('[WebRTC] Error in client peer init:', e);
    }
  }

  /**
   * Broadcast state to all connected peers and relay brokers
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
   * Send player join request
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
   * Send leave notice when a player leaves/disconnects
   */
  public sendLeaveNotice(roomId: string, playerId: string): void {
    const msg: SyncMessage = {
      type: 'LEAVE_NOTICE',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      playerId
    };
    this.send(msg);
  }

  /**
   * Send host migration notification
   */
  public sendHostMigrated(roomId: string, newHostPlayerId: string): void {
    const msg: SyncMessage = {
      type: 'HOST_MIGRATED',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      newHostPlayerId
    };
    this.send(msg);
  }

  /**
   * Send authoritative game action request to host
   */
  public sendGameAction(roomId: string, playerId: string, actionType: string, payload?: any): void {
    const msg: SyncMessage = {
      type: 'GAME_ACTION',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      playerId,
      actionType,
      payload
    };
    this.send(msg);
  }

  /**
   * Send message across all 3 active transports (WebRTC + MQTT + BroadcastChannel)
   */
  public send(msg: SyncMessage): void {
    const cleanRoom = msg.roomId.trim().toUpperCase();
    const topic = `turkishparadise/rooms/${cleanRoom.toLowerCase()}`;
    const payload = JSON.stringify(msg);

    // 1. WebRTC Direct DataChannels
    try {
      if (this.isHost) {
        // Send to all connected clients
        this.peerConnections.forEach((conn) => {
          if (conn.open) {
            conn.send(msg);
          }
        });
      } else if (this.hostConnection && this.hostConnection.open) {
        // Send directly to host
        this.hostConnection.send(msg);
      }
    } catch (e) {
      console.warn('[WebRTC] Send error:', e);
    }

    // 2. Local BroadcastChannel
    if (this.localChannel) {
      try {
        this.localChannel.postMessage(msg);
      } catch (e) {}
    }

    // 3. MQTT WebSocket Global Relay
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.publish(topic, payload, { qos: 1 });
      } catch (err) {
        console.warn('[Sync] MQTT Publish error:', err);
      }
    }
  }

  private ensureMqttConnection(): void {
    if (this.mqttClient && (this.isMqttConnected || this.mqttClient.reconnecting)) {
      if (this.currentRoomId) {
        const topic = `turkishparadise/rooms/${this.currentRoomId.toLowerCase()}`;
        this.mqttClient.subscribe(topic, { qos: 1 });
      }
      return;
    }

    const brokerUrl = BROKER_URLS[this.brokerIndex % BROKER_URLS.length];
    const clientId = `tp_${LOCAL_CLIENT_ID}_${Math.floor(Math.random() * 1000)}`;

    try {
      this.mqttClient = mqtt.connect(brokerUrl, {
        clientId,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 2500,
        keepalive: 30
      });

      this.mqttClient.on('connect', () => {
        this.isMqttConnected = true;
        console.log(`[MQTT] Connected to global relay broker: ${brokerUrl}`);
        if (this.currentRoomId) {
          const topic = `turkishparadise/rooms/${this.currentRoomId.toLowerCase()}`;
          this.mqttClient?.subscribe(topic, { qos: 1 });
        }
        // Always subscribe to global friend channel
        this.mqttClient?.subscribe('turkishparadise/global/friends', { qos: 1 });
      });

      this.mqttClient.on('message', (topic, message) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (topic === 'turkishparadise/global/friends') {
            if (parsed.senderClientId === LOCAL_CLIENT_ID) return;
            this.friendListeners.forEach((cb) => {
              try {
                cb(parsed);
              } catch (e) {}
            });
            return;
          }

          const syncMsg = parsed as SyncMessage;
          if (syncMsg.senderId === LOCAL_CLIENT_ID) return;
          this.notifyListeners(syncMsg);
        } catch (e) {}
      });

      this.mqttClient.on('error', (err) => {
        console.warn(`[MQTT] Connection error with ${brokerUrl}:`, err);
        this.isMqttConnected = false;
        this.brokerIndex++;
      });

      this.mqttClient.on('offline', () => {
        this.isMqttConnected = false;
      });
    } catch (e) {
      console.warn('[MQTT] Failed to initialize MQTT client:', e);
    }
  }

  /**
   * Broadcast global friend event (Friend Request, Accept, Presence)
   */
  public sendFriendMessage(payload: any): void {
    const data = {
      ...payload,
      senderClientId: payload?.senderClientId || LOCAL_CLIENT_ID,
      timestamp: Date.now()
    };
    const json = JSON.stringify(data);

    // 1. Local BroadcastChannel
    if (this.localChannel) {
      try {
        this.localChannel.postMessage({ type: 'FRIEND_SYSTEM_EVENT', payload: data });
      } catch (e) {}
    }

    // 2. Global MQTT topic
    this.ensureMqttConnection();
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.publish('turkishparadise/global/friends', json, { qos: 1 });
      } catch (err) {
        console.warn('[Sync] Friend MQTT publish warning:', err);
      }
    }
  }

  /**
   * Subscribe to global friend system events (requests, responses, presence)
   */
  public subscribeToFriendChannel(callback: (data: any) => void): () => void {
    this.ensureMqttConnection();
    this.friendListeners.add(callback);
    return () => {
      this.friendListeners.delete(callback);
    };
  }

  private notifyListeners(msg: SyncMessage): void {
    if (!this.currentRoomId) return;
    if (msg.roomId && msg.roomId.toUpperCase() !== this.currentRoomId.toUpperCase()) return;
    this.listeners.forEach((callback) => {
      try {
        callback(msg);
      } catch (err) {
        console.error('[Sync] Listener callback error:', err);
      }
    });
  }
}

export const syncManager = new MultiplayerSyncManager();
