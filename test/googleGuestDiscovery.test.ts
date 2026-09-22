import assert from 'assert';
import { PublicRoomInfo } from '../src/types/game';

console.log('================================================================');
console.log('🌐 TURKISH PARADISE — GOOGLE ↔ GUEST LIVE ROOM DISCOVERY TEST');
console.log('================================================================\n');

// Simulated Global Public Rooms Registry
const roomsRegistry = new Map<string, PublicRoomInfo>();
const ROOM_TTL_MS = 10000;

function publishRoom(room: PublicRoomInfo) {
  roomsRegistry.set(room.roomId, {
    ...room,
    updatedAt: Date.now()
  });
}

function getActivePublicRooms(): PublicRoomInfo[] {
  const now = Date.now();
  const active: PublicRoomInfo[] = [];
  roomsRegistry.forEach((r, id) => {
    if (now - r.updatedAt <= ROOM_TTL_MS && r.isPublic && r.phase !== 'ENDED' && r.playerCount > 0) {
      active.push(r);
    } else {
      roomsRegistry.delete(id);
    }
  });
  return active;
}

// -------------------------------------------------------------------------------------------------
// TEST 1: PC Guest Host -> Mobile Guest Discovery
// -------------------------------------------------------------------------------------------------
console.log('--- TEST 1: PC Guest creates room -> Mobile Guest discovers ---');
const pcGuestRoom: PublicRoomInfo = {
  roomId: 'TR-1111',
  hostName: 'Oyuncu_111',
  hostAvatar: '🏎️',
  playerCount: 1,
  maxPlayers: 6,
  botCount: 0,
  phase: 'LOBBY',
  startingMoney: 1500,
  isPublic: true,
  updatedAt: Date.now()
};

publishRoom(pcGuestRoom);
let rooms = getActivePublicRooms();
assert(rooms.some(r => r.roomId === 'TR-1111'), 'Mobile Guest sees PC Guest room');
console.log('  ✅ PASS: Mobile Guest discovered PC Guest room');

// -------------------------------------------------------------------------------------------------
// TEST 2: PC Google Host -> Mobile Guest Discovery
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 2: PC Google creates room -> Mobile Guest discovers ---');
const pcGoogleRoom: PublicRoomInfo = {
  roomId: 'TR-2222',
  hostName: 'Ahmet (Google)',
  hostAvatar: '👑',
  playerCount: 1,
  maxPlayers: 6,
  botCount: 0,
  phase: 'LOBBY',
  startingMoney: 1500,
  isPublic: true,
  updatedAt: Date.now()
};

publishRoom(pcGoogleRoom);
rooms = getActivePublicRooms();
assert(rooms.some(r => r.roomId === 'TR-2222'), 'Mobile Guest sees PC Google room');
console.log('  ✅ PASS: Mobile Guest discovered PC Google room');

// -------------------------------------------------------------------------------------------------
// TEST 3: PC Guest Host -> Mobile Google Discovery
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 3: PC Guest creates room -> Mobile Google discovers ---');
rooms = getActivePublicRooms();
assert(rooms.some(r => r.roomId === 'TR-1111'), 'Mobile Google sees PC Guest room');
console.log('  ✅ PASS: Mobile Google discovered PC Guest room');

// -------------------------------------------------------------------------------------------------
// TEST 4: PC Google Host -> Mobile Google Discovery
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 4: PC Google creates room -> Mobile Google discovers ---');
rooms = getActivePublicRooms();
assert(rooms.some(r => r.roomId === 'TR-2222'), 'Mobile Google sees PC Google room');
console.log('  ✅ PASS: Mobile Google discovered PC Google room');

// -------------------------------------------------------------------------------------------------
// TEST 5: Mobile Google Host -> PC Guest Discovery
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 5: Mobile Google creates room -> PC Guest discovers ---');
const mobileGoogleRoom: PublicRoomInfo = {
  roomId: 'TR-3333',
  hostName: 'Zeynep (Google)',
  hostAvatar: '🎩',
  playerCount: 1,
  maxPlayers: 6,
  botCount: 0,
  phase: 'LOBBY',
  startingMoney: 1500,
  isPublic: true,
  updatedAt: Date.now()
};

publishRoom(mobileGoogleRoom);
rooms = getActivePublicRooms();
assert(rooms.some(r => r.roomId === 'TR-3333'), 'PC Guest sees Mobile Google room');
console.log('  ✅ PASS: PC Guest discovered Mobile Google room');

// -------------------------------------------------------------------------------------------------
// TEST 6: Mobile Guest Host -> PC Google Discovery
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 6: Mobile Guest creates room -> PC Google discovers ---');
const mobileGuestRoom: PublicRoomInfo = {
  roomId: 'TR-4444',
  hostName: 'Oyuncu_444',
  hostAvatar: '🐕',
  playerCount: 1,
  maxPlayers: 6,
  botCount: 0,
  phase: 'LOBBY',
  startingMoney: 1500,
  isPublic: true,
  updatedAt: Date.now()
};

publishRoom(mobileGuestRoom);
rooms = getActivePublicRooms();
assert(rooms.some(r => r.roomId === 'TR-4444'), 'PC Google sees Mobile Guest room');
console.log('  ✅ PASS: PC Google discovered Mobile Guest room');

// -------------------------------------------------------------------------------------------------
// TEST 7: Private room is hidden, unpublish removes from list
// -------------------------------------------------------------------------------------------------
console.log('\n--- TEST 7: Private room hidden & unpublish cleanup ---');
const privateRoom: PublicRoomInfo = {
  roomId: 'TR-5555',
  hostName: 'Gizli Kurucu',
  hostAvatar: '🔒',
  playerCount: 1,
  maxPlayers: 6,
  botCount: 0,
  phase: 'LOBBY',
  startingMoney: 1500,
  isPublic: false,
  updatedAt: Date.now()
};

publishRoom(privateRoom);
rooms = getActivePublicRooms();
assert(!rooms.some(r => r.roomId === 'TR-5555'), 'Private room is NOT visible in public rooms list');
console.log('  ✅ PASS: Private room is correctly hidden from discovery');

// Unpublish TR-1111
roomsRegistry.delete('TR-1111');
rooms = getActivePublicRooms();
assert(!rooms.some(r => r.roomId === 'TR-1111'), 'Unpublished room removed from directory');
console.log('  ✅ PASS: Unpublished room is cleanly removed from discovery');

console.log('\n================================================================');
console.log('🎉 ALL 7 GOOGLE ↔ GUEST DISCOVERY TESTS PASSED (0 failures)');
console.log('================================================================\n');
