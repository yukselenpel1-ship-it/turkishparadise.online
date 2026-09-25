import { describe, it, expect } from 'vitest';
import {
  InMemoryRoomStorage,
  getRoomStateKey,
  getActionIdempotencyKey,
  normalizeRoomId,
  sanitizeGameStateForStorage,
  GAME_STATE_TTL_SECONDS
} from '../src/server/storage/roomStorage';
import { createInitialState } from '../src/engine/gameEngine';
import { GameState } from '../src/types/game';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  expect(condition).toBe(true);
  if (condition) {
    passedTests++;
  } else {
    failedTests++;
  }
}

describe('Server Storage Suite', () => {
  it('executes full server storage and atomic CAS verification', async () => {
  const storage = new InMemoryRoomStorage();

  // --------------------------------------------------------------------------
  // TEST 1: Key Normalization & Helper Functions
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Key Normalization & Helpers ---');
  assert(normalizeRoomId('tr-1001 ') === 'TR-1001', 'Room ID normalized to uppercase trimmed TR-1001');
  assert(getRoomStateKey('tr-1001') === 'tp:room:TR-1001:state', 'Correct canonical state key format');
  assert(getActionIdempotencyKey('tr-1001', 'act_123') === 'tp:room:TR-1001:action:act_123', 'Correct action idempotency key format');

  // --------------------------------------------------------------------------
  // TEST 2: Create & Read Room State
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Create & Read Room State ---');
  const baseState = createInitialState({ roomCode: 'TR-1001', startingMoney: 1500 });
  baseState.sessionId = 'sess_canonical_100';
  baseState.players = [
    { id: 'p1', name: 'Ahmet', color: '#3B82F6', avatar: '🎩', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isHost: true, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 },
    { id: 'p2', name: 'Mehmet', color: '#EF4444', avatar: '🏎️', money: 1500, position: 0, isJailed: false, jailTurns: 0, inGame: true, isHost: false, isBot: false, lapsCompleted: 0, firstLapPurchases: 0 }
  ];

  const created = await storage.createRoomState('TR-1001', baseState);
  assert(created.roomId === 'TR-1001', 'Created room with correct roomId');
  assert(created.version === 1, 'Initial state created with version 1');
  assert(typeof created.updatedAt === 'number', 'Initial state has valid updatedAt timestamp');

  const readState = await storage.getRoomState('TR-1001');
  assert(readState !== null, 'Successfully read state from storage');
  assert(readState?.sessionId === 'sess_canonical_100', 'Session ID preserved in storage');
  assert(readState?.players.length === 2, '2 players preserved in storage');

  // --------------------------------------------------------------------------
  // TEST 3: Monotonic Version Increment on Mutation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Monotonic Version Increment on Mutation ---');
  const mutateState: GameState = JSON.parse(JSON.stringify(readState));
  mutateState.players[0].money = 1440; // Ahmet bought Hatay (60₺)
  mutateState.board[1].ownerId = 'p1';

  const saveRes = await storage.saveRoomStateWithVersion('TR-1001', 1, mutateState);
  assert(saveRes.success === true, 'Saved state successfully with expected version 1');
  assert(saveRes.currentVersion === 2, 'State version monotonically incremented to 2');
  assert(saveRes.state?.players[0].money === 1440, 'Updated state contains mutated balance (1440₺)');

  const verifyRead = await storage.getRoomState('TR-1001');
  assert(verifyRead?.version === 2, 'Storage holds version 2 after mutation');

  // --------------------------------------------------------------------------
  // TEST 4: Stale Version / Version Conflict Rejection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Stale Version Rejection (VERSION_CONFLICT) ---');
  const staleAttempt: GameState = JSON.parse(JSON.stringify(verifyRead));
  staleAttempt.players[1].money = 999999; // Stale write attempt

  // Trying to save with expectedVersion: 1 when currentVersion is 2
  const staleRes = await storage.saveRoomStateWithVersion('TR-1001', 1, staleAttempt);
  assert(staleRes.success === false, 'Stale write rejected');
  assert(staleRes.error === 'VERSION_CONFLICT', 'Error code is VERSION_CONFLICT');
  assert(staleRes.currentVersion === 2, 'Returned currentVersion is 2');

  const afterStaleRead = await storage.getRoomState('TR-1001');
  assert(afterStaleRead?.players[1].money === 1500, 'State remained unchanged (Mehmet money still 1500₺)');

  // --------------------------------------------------------------------------
  // TEST 5: Atomic Concurrency (Two Concurrent Writes -> Exactly One Succeeds)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Atomic Concurrency (Two Concurrent Serverless Writes) ---');
  
  // Instance A and Instance B both read version 2
  const stateA: GameState = JSON.parse(JSON.stringify(afterStaleRead));
  const stateB: GameState = JSON.parse(JSON.stringify(afterStaleRead));

  stateA.players[0].position = 5; // Instance A rolls dice for Ahmet
  stateB.players[1].position = 4; // Instance B rolls dice for Mehmet

  // Both attempt to save concurrently expecting version 2
  const [resA, resB] = await Promise.all([
    storage.saveRoomStateWithVersion('TR-1001', 2, stateA),
    storage.saveRoomStateWithVersion('TR-1001', 2, stateB)
  ]);

  const successCount = (resA.success ? 1 : 0) + (resB.success ? 1 : 0);
  const conflictCount = (!resA.success && resA.error === 'VERSION_CONFLICT' ? 1 : 0) +
                        (!resB.success && resB.error === 'VERSION_CONFLICT' ? 1 : 0);

  assert(successCount === 1, 'Exactly one concurrent mutation succeeded');
  assert(conflictCount === 1, 'Exactly one concurrent mutation received VERSION_CONFLICT');

  const finalConcurrentState = await storage.getRoomState('TR-1001');
  assert(finalConcurrentState?.version === 3, 'State version is now cleanly incremented to 3');

  // --------------------------------------------------------------------------
  // TEST 6: Action Idempotency Protection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Action Idempotency Protection ---');
  const testActionId = 'act_unique_roll_987654';

  const firstAttempt = await storage.checkAndRecordActionIdempotency('TR-1001', testActionId, 60);
  assert(firstAttempt.isDuplicate === false, 'First action execution marked isDuplicate: false');

  const duplicateAttempt = await storage.checkAndRecordActionIdempotency('TR-1001', testActionId, 60);
  assert(duplicateAttempt.isDuplicate === true, 'Rapid replay of same actionId marked isDuplicate: true');

  const differentAction = await storage.checkAndRecordActionIdempotency('TR-1001', 'act_different_456', 60);
  assert(differentAction.isDuplicate === false, 'Different actionId allowed (isDuplicate: false)');

  // --------------------------------------------------------------------------
  // TEST 7: Room Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Room Isolation (Room A vs Room B) ---');
  const roomBState = createInitialState({ roomCode: 'TR-2002', startingMoney: 2000 });
  await storage.createRoomState('TR-2002', roomBState);

  const roomA = await storage.getRoomState('TR-1001');
  const roomB = await storage.getRoomState('TR-2002');

  assert(roomA?.roomId === 'TR-1001', 'Room A retrieved correctly');
  assert(roomB?.roomId === 'TR-2002', 'Room B retrieved correctly');
  assert(roomA?.version === 3, 'Room A is at version 3');
  assert(roomB?.version === 1, 'Room B is at version 1 (isolated)');

  // --------------------------------------------------------------------------
  // TEST 8: State Array Sanitation & Bounding (Prevent Memory Bloat)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: State Array Sanitation & Memory Bounding ---');
  const bloatedState = createInitialState({ roomCode: 'TR-9999' });
  
  // Create 100 logs, 100 chat messages, 100 transactions
  bloatedState.logs = Array.from({ length: 100 }, (_, i) => ({ id: `${i}`, timestamp: '12:00', text: `Log ${i}`, type: 'info' }));
  bloatedState.chatMessages = Array.from({ length: 100 }, (_, i) => ({ id: `${i}`, senderId: 'p1', senderName: 'P1', senderAvatar: '🎲', senderColor: '#fff', text: `Msg ${i}`, timestamp: '12:00' }));
  bloatedState.transactions = Array.from({ length: 100 }, (_, i) => ({ id: `${i}`, playerId: 'p1', playerName: 'P1', playerAvatar: '🎲', playerColor: '#fff', type: 'income', category: 'salary', amount: 200, balanceAfter: 1500, description: `Tx ${i}`, timestamp: '12:00' }));

  const sanitized = sanitizeGameStateForStorage(bloatedState);
  assert(sanitized.logs.length === 30, 'Logs array capped at max 30 items');
  assert(sanitized.chatMessages.length === 50, 'Chat messages array capped at max 50 items');
  assert(sanitized.transactions.length === 50, 'Transactions array capped at max 50 items');

  // --------------------------------------------------------------------------
  // TEST 9: Touch & Delete Operations
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 9: Touch & Delete Operations ---');
  const touched = await storage.touchRoom('TR-1001');
  assert(touched === true, 'Successfully touched active room (TTL refreshed)');

  const deleted = await storage.deleteRoomState('TR-9999');
  assert(deleted === false, 'Deleting non-existent room returned false');

  const deletedReal = await storage.deleteRoomState('TR-2002');
  assert(deletedReal === true, 'Deleting existing room returned true');
  const postDeleteRead = await storage.getRoomState('TR-2002');
  assert(postDeleteRead === null, 'Deleted room no longer exists in storage');

  // --------------------------------------------------------------------------
  // TEST 10: Malformed & Invalid Input Handling
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 10: Malformed Input Rejection ---');
  let threwMalformed = false;
  try {
    await storage.createRoomState('', null as any);
  } catch {
    threwMalformed = true;
  }
  assert(threwMalformed, 'Empty roomId and null state properly rejected with Error');

    expect(failedTests).toBe(0);
  });
});
