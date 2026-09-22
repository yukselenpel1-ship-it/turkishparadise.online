import mqtt, { MqttClient } from 'mqtt';
import Peer, { DataConnection } from 'peerjs';
import { GameState, Player, ChatMessage, TradeOffer } from '../types/game';

import { getClientId, getTabId, getParticipantKey, logIdentityTelemetry } from './identityService';

// Unique client session ID
export const LOCAL_CLIENT_ID = `client_${Math.random().toString(36).substring(2, 11)}`;

// Public WebSocket MQTT Broker (Free, Global, SSL encrypted, zero token needed)
const PRIMARY_BROKER_URL = 'wss://broker.hivemq.com:8884/mqtt';

export type SyncMessage =
  | { type: 'STATE_SYNC'; senderId: string; roomId: string; sessionId?: string; gameId?: string; version: number; state: GameState }
  | {
      type: 'DICE_ROLLED';
      senderId: string;
      roomId: string;
      sessionId?: string;
      gameId?: string;
      playerId: string;
      dice: [number, number];
      total: number;
      isDouble: boolean;
      doublesStreak: number;
      startPosition: number;
      targetPosition: number;
      passedGo: boolean;
    }
  | {
      type: 'JOIN_REQUEST';
      senderId: string;
      roomId: string;
      requestId?: string;
      clientId?: string;
      tabId?: string;
      participantKey?: string;
      player: Player;
    }
  | {
      type: 'JOIN_ACCEPT';
      senderId: string;
      roomId: string;
      requestId?: string;
      targetPlayerId?: string;
      targetClientId?: string;
      targetParticipantKey?: string;
      sessionId?: string;
      gameId?: string;
      assignedPlayerId?: string;
      hostPlayerId?: string;
      state: GameState;
    }
  | {
      type: 'JOIN_CONFIRM';
      senderId: string;
      roomId: string;
      requestId?: string;
      clientId?: string;
      tabId?: string;
      participantKey?: string;
      playerId: string;
      sessionId?: string;
      gameId?: string;
    }
  | {
      type: 'JOIN_REJECTED';
      senderId: string;
      roomId: string;
      requestId?: string;
      targetPlayerId?: string;
      targetClientId?: string;
      targetParticipantKey?: string;
      reason: string;
    }
  | {
      type: 'WATCH_REQUEST';
      senderId: string;
      roomId: string;
      requestId?: string;
      clientId?: string;
      tabId?: string;
      participantKey?: string;
      spectator: { id: string; name: string; avatar: string; userId?: string; clientId?: string; tabId?: string; participantKey?: string };
    }
  | {
      type: 'WATCH_ACCEPT';
      senderId: string;
      roomId: string;
      requestId?: string;
      targetSpectatorId?: string;
      targetClientId?: string;
      targetParticipantKey?: string;
      sessionId?: string;
      gameId?: string;
      state: GameState;
    }
  | {
      type: 'WATCH_CONFIRM';
      senderId: string;
      roomId: string;
      requestId?: string;
      clientId?: string;
      tabId?: string;
      participantKey?: string;
      spectatorId: string;
      spectatorName?: string;
      sessionId?: string;
      gameId?: string;
    }
  | { type: 'LEAVE_NOTICE'; senderId: string; roomId: string; sessionId?: string; playerId: string; participantKey?: string }
  | { type: 'HOST_MIGRATED'; senderId: string; roomId: string; sessionId?: string; newHostPlayerId: string }
  | { type: 'REQUEST_SYNC'; senderId: string; roomId: string; sessionId?: string; playerId?: string; participantKey?: string }
  | { type: 'CHAT_MESSAGE'; senderId: string; roomId: string; sessionId?: string; message: ChatMessage }
  | { type: 'TRADE_OFFER'; senderId: string; roomId: string; sessionId?: string; offer: TradeOffer }
  | { type: 'GAME_ACTION'; senderId: string; roomId: string; sessionId?: string; gameId?: string; playerId: string; actionType: string; payload?: any; actionId?: string }
  | { type: 'ROOM_CLOSED'; senderId: string; roomId: string; sessionId?: string; reason?: string };

export type MessageCallback = (msg: SyncMessage) => void;

class MultiplayerSyncManager {
  private mqttClient: MqttClient | null = null;
  private peer: Peer | null = null;
  private peerConnections: Map<string, DataConnection> = new Map();
  private hostConnection: DataConnection | null = null;
  private currentRoomId: string | null = null;
  private currentSessionId: string | null = null;
  private localChannel: BroadcastChannel | null = null;
  private listeners: Set<MessageCallback> = new Set();
  private friendListeners: Set<(data: any) => void> = new Set();
  private isMqttConnected = false;
  private isHost = false;
  private currentVersion = 0;
  private brokerIndex = 0;

  private subscribedTopics: Set<string> = new Set();
  private topicListeners: Map<string, Set<(payload: any, topic: string) => void>> = new Map();
  private pendingPublishes: { topic: string; payload: string; retain: boolean; qos: 0 | 1 }[] = [];

  constructor() {
    // 1. Setup local BroadcastChannel for multi-tab on same machine
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.localChannel = new BroadcastChannel('tp_global_multiplayer_channel');
        this.localChannel.onmessage = (event) => {
          if (event.data) {
            if (event.data.type === 'TOPIC_PUBLISH' && event.data.topic && event.data.payload) {
              this.dispatchTopicMessage(event.data.topic, event.data.payload);
            } else if (event.data.senderId !== LOCAL_CLIENT_ID) {
              this.notifyListeners(event.data);
            }
          }
        };
      }
    } catch (e) {
      console.warn('[Sync] BroadcastChannel unsupported:', e);
    }

    // Auto-connect to MQTT global cloud relay immediately
    this.ensureMqttConnection();
  }

  /**
   * Helper to match MQTT topic with wildcards (# and +)
   */
  private matchTopic(pattern: string, topic: string): boolean {
    if (pattern === topic || pattern === '#') return true;
    const pParts = pattern.split('/');
    const tParts = topic.split('/');
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i] === '#') return true;
      if (pParts[i] === '+') {
        if (i >= tParts.length) return false;
        continue;
      }
      if (pParts[i] !== tParts[i]) return false;
    }
    return pParts.length === tParts.length;
  }

  private dispatchTopicMessage(topic: string, payload: any): void {
    this.topicListeners.forEach((callbacks, pattern) => {
      if (this.matchTopic(pattern, topic)) {
        callbacks.forEach((cb) => {
          try {
            cb(payload, topic);
          } catch (e) {
            console.warn('[Sync] Topic callback error:', e);
          }
        });
      }
    });
  }

  /**
   * Publish retained message across MQTT cloud brokers for permanent cross-device persistence
   */
  public publishRetained(topic: string, data: any): void {
    const cleanTopic = topic.trim();
    const payloadStr = typeof data === 'string' ? data : JSON.stringify(data);

    // 1. Local BroadcastChannel
    if (this.localChannel) {
      try {
        this.localChannel.postMessage({ type: 'TOPIC_PUBLISH', topic: cleanTopic, payload: data });
      } catch (e) {}
    }

    // 2. Local memory dispatch immediately
    this.dispatchTopicMessage(cleanTopic, data);

    // 3. Global MQTT Broker with retain: true, qos: 1
    this.ensureMqttConnection();
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.publish(cleanTopic, payloadStr, { retain: true, qos: 1 }, (err) => {
          if (err) console.warn(`[MQTT] Retained publish error on ${cleanTopic}:`, err);
        });
      } catch (err) {
        console.warn('[MQTT] Retained publish exception:', err);
      }
    } else {
      this.pendingPublishes.push({ topic: cleanTopic, payload: payloadStr, retain: true, qos: 1 });
    }
  }

  /**
   * Broadcast a message to a global topic across all devices (non-retained or retained)
   */
  public broadcastGlobal(topic: string, data: any, retain = false): void {
    const cleanTopic = topic.trim();
    const payloadStr = typeof data === 'string' ? data : JSON.stringify(data);

    // 1. Local BroadcastChannel
    if (this.localChannel) {
      try {
        this.localChannel.postMessage({ type: 'TOPIC_PUBLISH', topic: cleanTopic, payload: data });
      } catch (e) {}
    }

    // 2. Local memory dispatch
    this.dispatchTopicMessage(cleanTopic, data);

    // 3. Global MQTT Broker
    this.ensureMqttConnection();
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.publish(cleanTopic, payloadStr, { retain, qos: 1 }, (err) => {
          if (err) console.warn(`[MQTT] Global broadcast error on ${cleanTopic}:`, err);
        });
      } catch (err) {
        console.warn('[MQTT] Global broadcast exception:', err);
      }
    } else {
      this.pendingPublishes.push({ topic: cleanTopic, payload: payloadStr, retain, qos: 1 });
    }
  }

  /**
   * Subscribe to specific MQTT topic pattern (supports wildcards + and #)
   */
  public subscribeTopic(topicPattern: string, callback: (payload: any, topic: string) => void): () => void {
    const cleanPattern = topicPattern.trim();
    this.subscribedTopics.add(cleanPattern);

    if (!this.topicListeners.has(cleanPattern)) {
      this.topicListeners.set(cleanPattern, new Set());
    }
    this.topicListeners.get(cleanPattern)!.add(callback);

    this.ensureMqttConnection();
    if (this.mqttClient && this.isMqttConnected) {
      this.mqttClient.subscribe(cleanPattern, { qos: 1 });
    }

    return () => {
      const listeners = this.topicListeners.get(cleanPattern);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.topicListeners.delete(cleanPattern);
          this.subscribedTopics.delete(cleanPattern);
          if (this.mqttClient && this.isMqttConnected) {
            try {
              if (
                cleanPattern !== 'turkishparadise/global/public_rooms' &&
                cleanPattern !== 'turkishparadise/global/friends'
              ) {
                this.mqttClient.unsubscribe(cleanPattern);
              }
            } catch (e) {}
          }
        }
      }
    };
  }

  /**
   * Initialize and join room over WebRTC (PeerJS) & MQTT WebSocket
   */
  public joinRoom(roomId: string, onMessage: MessageCallback, isHostRole = false, sessionId?: string): () => void {
    const cleanRoomId = roomId.trim().toUpperCase();
    this.currentRoomId = cleanRoomId;
    // Host sets authoritative sessionId; Guest leaves null until adopted from Host's STATE_SYNC
    this.currentSessionId = isHostRole ? (sessionId || null) : null;
    this.isHost = isHostRole;
    this.listeners.add(onMessage);

    // Register topic immediately
    const roomTopic = `turkishparadise/rooms/${cleanRoomId.toLowerCase()}`;
    this.subscribedTopics.add(roomTopic);

    // 1. Connect MQTT WebSockets
    this.ensureMqttConnection();

    // Subscribe now if already connected (don't wait for 'connect' event)
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.subscribe(roomTopic, { qos: 1 });
      } catch (e) {}
    }

    // 2. Setup PeerJS WebRTC P2P mesh
    this.initPeerJs(cleanRoomId);

    // 3. Request initial state from host
    setTimeout(() => {
      this.send({
        type: 'REQUEST_SYNC',
        senderId: LOCAL_CLIENT_ID,
        roomId: cleanRoomId,
        sessionId: this.currentSessionId || undefined
      });
    }, 400);

    return () => {
      this.listeners.delete(onMessage);
    };
  }

  /**
   * Prepare for joining a room as guest:
   * Sets currentRoomId and subscribes to MQTT room topic IMMEDIATELY,
   * so JOIN_ACCEPT responses are not missed when they arrive before joinRoom() is called.
   */
  public prepareForRoom(roomId: string): void {
    const cleanRoomId = roomId.trim().toUpperCase();
    this.currentRoomId = cleanRoomId;
    this.isHost = false;
    this.currentSessionId = null;

    // Register room topic immediately so it survives reconnects
    const roomTopic = `turkishparadise/rooms/${cleanRoomId.toLowerCase()}`;
    this.subscribedTopics.add(roomTopic);

    this.ensureMqttConnection();

    // Subscribe NOW — don't wait for the next 'connect' event
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.subscribe(roomTopic, { qos: 1 });
      } catch (e) {
        console.warn('[Sync] prepareForRoom subscribe error:', e);
      }
    }
  }

  public setSessionId(sessionId: string | null): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Setup PeerJS WebRTC Direct DataChannel
   */
  private initPeerJs(roomId: string) {
    try {
      if (typeof window === 'undefined' || typeof Peer !== 'function') return;
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
              const msg = data as SyncMessage;
              if (msg.senderId !== LOCAL_CLIENT_ID) {
                this.notifyListeners(msg);
                // Relay to other connected peers
                this.peerConnections.forEach((otherConn, otherPeerId) => {
                  if (otherPeerId !== conn.peer && otherConn.open) {
                    otherConn.send(msg);
                  }
                });
              }
            } catch (e) {}
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
        this.peer = new Peer({
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:global.stun.twilio.com:3478' }
            ]
          }
        });

        this.peer.on('open', () => {
          this.connectToHost(hostPeerId);
        });
      }
    } catch (err) {
      console.warn('[WebRTC] PeerJS init error:', err);
    }
  }

  private initPeerJsClient(roomId: string, hostPeerId: string) {
    try {
      if (typeof window === 'undefined' || typeof Peer !== 'function') return;
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
            roomId: roomId.toUpperCase(),
            sessionId: this.currentSessionId || undefined
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

  private connectToHost(hostPeerId: string) {
    if (!this.peer) return;
    try {
      this.hostConnection = this.peer.connect(hostPeerId, { reliable: true });

      this.hostConnection.on('open', () => {
        console.log(`[WebRTC] Connected to Host DataChannel: ${hostPeerId}`);
      });

      this.hostConnection.on('data', (data) => {
        try {
          const msg = data as SyncMessage;
          if (msg.senderId !== LOCAL_CLIENT_ID) {
            this.notifyListeners(msg);
          }
        } catch (e) {}
      });

      this.hostConnection.on('close', () => {
        console.log('[WebRTC] Host connection closed');
      });
    } catch (err) {
      console.warn('[WebRTC] Connect to host error:', err);
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
      sessionId: state.sessionId,
      gameId: state.gameId,
      version: this.currentVersion,
      state
    };
    this.send(msg);
  }

  /**
   * Send player join request (Guest -> Host)
   */
  public sendJoinRequest(roomId: string, player: Player, requestId?: string): string {
    const reqId = requestId || `join_req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cId = player.clientId || getClientId();
    const tId = player.tabId || getTabId();
    const pKey = player.participantKey || getParticipantKey();
    const msg: SyncMessage = {
      type: 'JOIN_REQUEST',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      requestId: reqId,
      clientId: cId,
      tabId: tId,
      participantKey: pKey,
      player: {
        ...player,
        clientId: cId,
        tabId: tId,
        participantKey: pKey
      }
    };
    this.send(msg);
    return reqId;
  }

  /**
   * Send join accept from host with authoritative session data (Host -> Guest)
   */
  public sendJoinAccept(
    roomId: string,
    targetPlayerId: string,
    state: GameState,
    requestId?: string,
    targetParticipantKey?: string
  ): void {
    const msg: SyncMessage = {
      type: 'JOIN_ACCEPT',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      requestId: requestId || `req_acc_${Date.now()}`,
      targetPlayerId,
      targetClientId: targetPlayerId,
      targetParticipantKey,
      assignedPlayerId: targetPlayerId,
      sessionId: state.sessionId,
      gameId: state.gameId,
      hostPlayerId: state.hostPlayerId,
      state
    };
    this.send(msg);
  }

  /**
   * Send join confirmation once authoritative state is adopted (Guest -> Host)
   */
  public sendJoinConfirm(roomId: string, playerId: string, sessionId?: string, requestId?: string, participantKey?: string): void {
    const cId = getClientId();
    const tId = getTabId();
    const pKey = participantKey || getParticipantKey();
    const msg: SyncMessage = {
      type: 'JOIN_CONFIRM',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      requestId: requestId || `req_conf_${Date.now()}`,
      clientId: cId,
      tabId: tId,
      participantKey: pKey,
      playerId,
      sessionId: sessionId || this.currentSessionId || undefined
    };
    this.send(msg);
  }

  /**
   * Send join rejection if room full or game in progress (Host -> Guest)
   */
  public sendJoinRejected(roomId: string, targetPlayerId: string, reason: string, requestId?: string, targetParticipantKey?: string): void {
    const msg: SyncMessage = {
      type: 'JOIN_REJECTED',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      targetPlayerId,
      targetClientId: targetPlayerId,
      targetParticipantKey,
      requestId: requestId || `req_rej_${Date.now()}`,
      reason
    };
    this.send(msg);
  }

  /**
   * Send spectator watch request (Spectator -> Host)
   */
  public sendWatchRequest(
    roomId: string,
    spectator: { id: string; name: string; avatar: string; userId?: string; clientId?: string; tabId?: string; participantKey?: string },
    requestId?: string
  ): string {
    const reqId = requestId || `watch_req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cId = spectator.clientId || getClientId();
    const tId = spectator.tabId || getTabId();
    const pKey = spectator.participantKey || getParticipantKey();
    const msg: SyncMessage = {
      type: 'WATCH_REQUEST',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      requestId: reqId,
      clientId: cId,
      tabId: tId,
      participantKey: pKey,
      spectator: {
        ...spectator,
        clientId: cId,
        tabId: tId,
        participantKey: pKey
      }
    };
    this.send(msg);
    return reqId;
  }

  /**
   * Send watch accept with authoritative state (Host -> Spectator)
   */
  public sendWatchAccept(
    roomId: string,
    targetSpectatorId: string,
    state: GameState,
    requestId?: string,
    targetParticipantKey?: string
  ): void {
    const msg: SyncMessage = {
      type: 'WATCH_ACCEPT',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      requestId: requestId || `watch_acc_${Date.now()}`,
      targetSpectatorId,
      targetClientId: targetSpectatorId,
      targetParticipantKey,
      sessionId: state.sessionId || this.currentSessionId || '',
      gameId: state.gameId,
      state
    };
    this.send(msg);
  }

  /**
   * Send watch confirmation once state stream is hooked up (Spectator -> Host)
   */
  public sendWatchConfirm(roomId: string, spectatorId: string, spectatorName?: string, sessionId?: string, requestId?: string, participantKey?: string): void {
    const cId = getClientId();
    const tId = getTabId();
    const pKey = participantKey || getParticipantKey();
    const msg: SyncMessage = {
      type: 'WATCH_CONFIRM',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      requestId: requestId || `watch_conf_${Date.now()}`,
      clientId: cId,
      tabId: tId,
      participantKey: pKey,
      spectatorId,
      spectatorName,
      sessionId: sessionId || this.currentSessionId || undefined
    };
    this.send(msg);
  }

  /**
   * Send request sync to room host
   */
  public sendRequestSync(roomId: string, sessionId?: string): void {
    const msg: SyncMessage = {
      type: 'REQUEST_SYNC',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      sessionId
    };
    this.send(msg);
  }

  /**
   * Broadcast room closed / session terminated notification to all room peers (HOST ONLY)
   */
  public sendRoomClosed(roomId: string, sessionId?: string, reason = 'HOST_CLOSED'): void {
    if (!this.isHost) {
      console.warn('[Sync] Non-host attempted to send ROOM_CLOSED; blocked.');
      return;
    }
    const cleanRoom = roomId.trim().toUpperCase();
    const msg: SyncMessage = {
      type: 'ROOM_CLOSED',
      senderId: LOCAL_CLIENT_ID,
      roomId: cleanRoom,
      sessionId: sessionId || this.currentSessionId || undefined,
      reason
    };
    this.send(msg);
  }

  /**
   * Send leave notice when a player leaves/disconnects
   */
  public sendLeaveNotice(roomId: string, playerId: string, sessionId?: string): void {
    const msg: SyncMessage = {
      type: 'LEAVE_NOTICE',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      sessionId: sessionId || this.currentSessionId || undefined,
      playerId
    };
    this.send(msg);
  }

  /**
   * Hard reset / terminate current room session
   */
  public hardResetSession(roomId?: string, playerId?: string): void {
    const targetRoom = (roomId || this.currentRoomId || '').trim().toUpperCase();

    // Close all WebRTC peer connections
    try {
      if (this.hostConnection) {
        this.hostConnection.close();
        this.hostConnection = null;
      }
      this.peerConnections.forEach((conn) => {
        try {
          conn.close();
        } catch (e) {}
      });
      this.peerConnections.clear();
      if (this.peer) {
        this.peer.destroy();
        this.peer = null;
      }
    } catch (e) {}

    // Unsubscribe from room topic if connected
    if (targetRoom && this.mqttClient && this.isMqttConnected) {
      try {
        const topic = `turkishparadise/rooms/${targetRoom.toLowerCase()}`;
        this.mqttClient.unsubscribe(topic);
        this.subscribedTopics.delete(topic);
      } catch (e) {}
    }

    this.listeners.clear();
    this.currentRoomId = null;
    this.currentSessionId = null;
    this.isHost = false;
    this.currentVersion = 0;
  }

  /**
   * Safely leave room, closing all WebRTC connections, unsubscribing from room topic and resetting listeners
   */
  public leaveRoom(roomId?: string, playerId?: string, sessionId?: string): void {
    const targetRoom = roomId || this.currentRoomId;
    if (targetRoom && playerId) {
      this.sendLeaveNotice(targetRoom, playerId, sessionId);
    }
    this.hardResetSession(targetRoom || undefined, playerId);
  }

  /**
   * Send host migration notification
   */
  public sendHostMigrated(roomId: string, newHostPlayerId: string, sessionId?: string): void {
    const msg: SyncMessage = {
      type: 'HOST_MIGRATED',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      sessionId,
      newHostPlayerId
    };
    this.send(msg);
  }

  /**
   * Broadcast real-time lightweight dice roll event to all room participants
   */
  public sendDiceRolled(
    roomId: string,
    playerId: string,
    dice: [number, number],
    total: number,
    isDouble: boolean,
    doublesStreak: number,
    startPosition: number,
    targetPosition: number,
    passedGo: boolean,
    sessionId?: string,
    gameId?: string
  ): void {
    const msg: SyncMessage = {
      type: 'DICE_ROLLED',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      sessionId: sessionId || this.currentSessionId || undefined,
      gameId,
      playerId,
      dice,
      total,
      isDouble,
      doublesStreak,
      startPosition,
      targetPosition,
      passedGo
    };
    this.send(msg);
  }

  /**
   * Send authoritative game action request to host
   */
  public sendGameAction(
    roomId: string,
    playerId: string,
    actionType: string,
    payload?: any,
    sessionId?: string,
    gameId?: string
  ): string {
    const actionId = `${LOCAL_CLIENT_ID}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const msg: SyncMessage = {
      type: 'GAME_ACTION',
      senderId: LOCAL_CLIENT_ID,
      roomId: roomId.trim().toUpperCase(),
      sessionId: sessionId || this.currentSessionId || undefined,
      gameId,
      playerId,
      actionType,
      payload,
      actionId
    };
    this.send(msg);
    return actionId;
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

    // 3. MQTT WebSocket Global Relay (qos: 0 for instant, zero-latency delivery without PUBACK roundtrip)
    if (this.mqttClient && this.isMqttConnected) {
      try {
        this.mqttClient.publish(topic, payload, { qos: 0 });
      } catch (err) {
        console.warn('[Sync] MQTT Publish error:', err);
      }
    } else {
      this.pendingPublishes.push({ topic, payload, retain: false, qos: 0 });
    }
  }

  private ensureMqttConnection(): void {
    if (this.currentRoomId) {
      const topic = `turkishparadise/rooms/${this.currentRoomId.toLowerCase()}`;
      this.subscribedTopics.add(topic);
    }

    if (this.mqttClient && (this.isMqttConnected || this.mqttClient.reconnecting)) {
      if (this.currentRoomId && this.mqttClient) {
        const topic = `turkishparadise/rooms/${this.currentRoomId.toLowerCase()}`;
        try {
          this.mqttClient.subscribe(topic, { qos: 1 });
        } catch (e) {}
      }
      return;
    }

    const brokerUrl = PRIMARY_BROKER_URL;
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
        // Always subscribe to global channels
        this.mqttClient?.subscribe('turkishparadise/global/friends', { qos: 1 });
        this.mqttClient?.subscribe('turkishparadise/global/public_rooms', { qos: 1 });

        // Re-subscribe to all dynamic topics
        this.subscribedTopics.forEach((tp) => {
          this.mqttClient?.subscribe(tp, { qos: 1 });
        });

        // Flush pending queued messages
        if (this.pendingPublishes.length > 0) {
          const toSend = [...this.pendingPublishes];
          this.pendingPublishes = [];
          toSend.forEach((item) => {
            try {
              this.mqttClient?.publish(item.topic, item.payload, { retain: item.retain, qos: item.qos });
            } catch (e) {}
          });
        }
      });

      this.mqttClient.on('message', (topic, message) => {
        try {
          const raw = message.toString();
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            parsed = raw;
          }

          // Dispatch to dynamic topic listeners
          this.dispatchTopicMessage(topic, parsed);

          if (topic === 'turkishparadise/global/friends') {
            if (parsed && parsed.senderClientId === LOCAL_CLIENT_ID) return;
            this.friendListeners.forEach((cb) => {
              try {
                cb(parsed);
              } catch (e) {}
            });
            return;
          }

          const syncMsg = parsed as SyncMessage;
          if (syncMsg && syncMsg.senderId === LOCAL_CLIENT_ID) return;
          this.notifyListeners(syncMsg);
        } catch (e) {}
      });

      this.mqttClient.on('error', (err) => {
        console.warn(`[MQTT] Connection notice (${brokerUrl}):`, err);
        this.isMqttConnected = false;
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

  public notifyListeners(msg: SyncMessage): void {
    // 0. Directory-only messages must never reach room session listeners
    const msgType = (msg as any).type;
    if (msgType === 'PUBLIC_ROOM_REMOVED' || msgType === 'ROOM_ANNOUNCE' || msgType === 'DISCOVERY_PING') {
      return;
    }

    // 1. Handshake & joining messages arrive before session agreement or during room transitions; never drop them
    if (
      msg.type === 'JOIN_REQUEST' ||
      msg.type === 'JOIN_ACCEPT' ||
      msg.type === 'JOIN_CONFIRM' ||
      msg.type === 'JOIN_REJECTED' ||
      msg.type === 'WATCH_REQUEST' ||
      msg.type === 'WATCH_ACCEPT' ||
      msg.type === 'WATCH_CONFIRM' ||
      msg.type === 'REQUEST_SYNC'
    ) {
      this.listeners.forEach((callback) => {
        try {
          callback(msg);
        } catch (err) {
          console.error('[Sync] Listener callback error:', err);
        }
      });
      return;
    }

    if (!this.currentRoomId) return;
    if (msg.roomId && msg.roomId.toUpperCase() !== this.currentRoomId.toUpperCase()) return;

    // 2. Authoritative host never gets closed by remote ROOM_CLOSED; Guest ignores ROOM_CLOSED from mismatched session
    if (msg.type === 'ROOM_CLOSED') {
      if (this.isHost) return;
      if (this.currentSessionId && msg.sessionId && msg.sessionId !== this.currentSessionId) {
        console.warn('[Sync] Ignored ROOM_CLOSED from mismatched session:', msg.sessionId, 'current:', this.currentSessionId);
        return;
      }
    }

    // 3. 🛡️ Session Guard: For state and in-game action sync, if both this client and message have sessionId and they mismatch, drop packet
    if (this.currentSessionId && msg.sessionId && msg.sessionId !== this.currentSessionId) {
      console.warn('[Sync] Dropped packet from mismatched session:', {
        type: msg.type,
        currentSession: this.currentSessionId,
        msgSession: msg.sessionId
      });
      return;
    }

    this.listeners.forEach((callback) => {
      try {
        callback(msg);
      } catch (err) {
        console.error('[Sync] Listener callback error:', err);
      }
    });
  }
}

export { MultiplayerSyncManager };
export const syncManager = new MultiplayerSyncManager();
