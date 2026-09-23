import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyGameAction,
  defaultCryptoRng,
  advanceServerTurn,
  AuthenticatedActor,
  ServerErrorCode
} from '../src/server/game/serverGameEngine';
import { createInitialState, JAIL_TILE_INDEX, TOTAL_TILES } from '../src/engine/gameEngine';
import { GameState, Player, BoardTile } from '../src/types/game';
import { GameAction } from '../src/server/storage/roomStorage';

function createTestPlayers(): Player[] {
  return [
    {
      id: 'player_host',
      userId: 'user_host',
      name: 'Host Player',
      avatar: '🏎️',
      color: '#EF4444',
      money: 1500,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      inGame: true,
      isHost: true,
      isBot: false,
      lapsCompleted: 0,
      firstLapPurchases: 0
    },
    {
      id: 'player_guest',
      userId: 'user_guest',
      name: 'Guest Player',
      avatar: '🎩',
      color: '#3B82F6',
      money: 1500,
      position: 0,
      isJailed: false,
      jailTurns: 0,
      inGame: true,
      isHost: false,
      isBot: false,
      lapsCompleted: 0,
      firstLapPurchases: 0
    }
  ];
}

describe('Server-Side Game Engine (applyGameAction)', () => {
  let initialState: GameState;
  const hostActor: AuthenticatedActor = { userId: 'user_host', isHost: true };
  const guestActor: AuthenticatedActor = { userId: 'user_guest', isHost: false };
  const hackerActor: AuthenticatedActor = { userId: 'user_hacker', isHost: false };

  beforeEach(() => {
    initialState = createInitialState();
    initialState.players = createTestPlayers();
    initialState.hostPlayerId = 'user_host';
  });

  describe('1. START_GAME Action', () => {
    it('allows the host to start the game when valid', () => {
      const action: GameAction = {
        actionId: 'act_start_1',
        roomId: initialState.roomId,
        playerId: 'player_host',
        type: 'START_GAME'
      };

      const res = applyGameAction(initialState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.phase).toBe('PLAYING');
      expect(res.state?.currentTurnIndex).toBe(0);
      expect(res.events?.[0].type).toBe('GAME_STARTED');
    });

    it('rejects start game if called by a non-host player', () => {
      const action: GameAction = {
        actionId: 'act_start_2',
        roomId: initialState.roomId,
        playerId: 'player_guest',
        type: 'START_GAME'
      };

      const res = applyGameAction(initialState, action, guestActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('UNAUTHORIZED_PLAYER');
    });

    it('rejects start game if less than 2 players', () => {
      initialState.players = [initialState.players[0]];
      const action: GameAction = {
        actionId: 'act_start_3',
        roomId: initialState.roomId,
        playerId: 'player_host',
        type: 'START_GAME'
      };

      const res = applyGameAction(initialState, action, hostActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('INVALID_PHASE');
    });
  });

  describe('2. ROLL_DICE Action & Movement Mechanics', () => {
    let playingState: GameState;

    beforeEach(() => {
      const startRes = applyGameAction(
        initialState,
        { actionId: 'act_start', roomId: initialState.roomId, playerId: 'player_host', type: 'START_GAME' },
        hostActor
      );
      playingState = startRes.state!;
    });

    it('rejects roll dice if it is not the players turn', () => {
      const action: GameAction = {
        actionId: 'act_roll_guest',
        roomId: playingState.roomId,
        playerId: 'player_guest',
        type: 'ROLL_DICE'
      };

      const res = applyGameAction(playingState, action, guestActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('NOT_YOUR_TURN');
    });

    it('uses server deterministic RNG and moves player', () => {
      const mockRng = () => [3, 4] as [number, number]; // Total = 7
      const action: GameAction = {
        actionId: 'act_roll_host',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'ROLL_DICE',
        payload: { fakeDice: [6, 6] } // Tampered dice in payload
      };

      const res = applyGameAction(playingState, action, hostActor, { rng: mockRng });
      expect(res.success).toBe(true);
      expect(res.state?.dice).toEqual([3, 4]); // Must be server generated, NOT [6, 6]
      expect(res.state?.players[0].position).toBe(7);
      expect(res.state?.diceRolled).toBe(true);
      expect(res.events?.[0].dice).toEqual([3, 4]);
    });

    it('prevents rolling twice in the same turn', () => {
      const mockRng = () => [2, 3] as [number, number];
      const action: GameAction = {
        actionId: 'act_roll_host_1',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'ROLL_DICE'
      };

      const res1 = applyGameAction(playingState, action, hostActor, { rng: mockRng });
      expect(res1.success).toBe(true);

      const action2: GameAction = {
        actionId: 'act_roll_host_2',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'ROLL_DICE'
      };
      const res2 = applyGameAction(res1.state!, action2, hostActor, { rng: mockRng });
      expect(res2.success).toBe(false);
      expect(res2.error).toBe('DICE_ALREADY_ROLLED');
    });

    it('awards pass-go salary when completing a lap', () => {
      playingState.players[0].position = 36; // Near end of board (38 total tiles)
      const initialMoney = playingState.players[0].money;
      const mockRng = () => [2, 3] as [number, number]; // Total = 5 -> new position = (36 + 5) % 38 = 3

      const action: GameAction = {
        actionId: 'act_roll_lap',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'ROLL_DICE'
      };

      const res = applyGameAction(playingState, action, hostActor, { rng: mockRng });
      expect(res.success).toBe(true);
      expect(res.state?.players[0].position).toBe(3);
      expect(res.state?.players[0].money).toBe(initialMoney + 200); // 200 passGoSalary
      expect(res.state?.players[0].lapsCompleted).toBe(1);
    });

    it('penalizes 3 consecutive doubles by sending player to jail', () => {
      playingState.doublesCount = 2; // Already rolled 2 doubles
      const mockRng = () => [4, 4] as [number, number]; // 3rd double

      const action: GameAction = {
        actionId: 'act_roll_3rd_double',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'ROLL_DICE'
      };

      const res = applyGameAction(playingState, action, hostActor, { rng: mockRng });
      expect(res.success).toBe(true);
      expect(res.state?.players[0].position).toBe(JAIL_TILE_INDEX);
      expect(res.state?.players[0].isJailed).toBe(true);
      expect(res.state?.doublesCount).toBe(0);
    });
  });

  describe('3. Jail Rules & Bail Mechanics', () => {
    let playingState: GameState;

    beforeEach(() => {
      const startRes = applyGameAction(
        initialState,
        { actionId: 'act_start', roomId: initialState.roomId, playerId: 'player_host', type: 'START_GAME' },
        hostActor
      );
      playingState = startRes.state!;
      playingState.players[0].position = JAIL_TILE_INDEX;
      playingState.players[0].isJailed = true;
      playingState.players[0].jailTurns = 0;
    });

    it('releases jailed player if they roll doubles', () => {
      const mockRng = () => [5, 5] as [number, number]; // Double
      const action: GameAction = {
        actionId: 'act_jail_roll_double',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'ROLL_DICE'
      };

      const res = applyGameAction(playingState, action, hostActor, { rng: mockRng });
      expect(res.success).toBe(true);
      expect(res.state?.players[0].isJailed).toBe(false);
    });

    it('keeps jailed player if they roll non-doubles on turn 1', () => {
      const mockRng = () => [2, 4] as [number, number]; // Non-double
      const action: GameAction = {
        actionId: 'act_jail_roll_fail',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'ROLL_DICE'
      };

      const res = applyGameAction(playingState, action, hostActor, { rng: mockRng });
      expect(res.success).toBe(true);
      expect(res.state?.players[0].isJailed).toBe(true);
      expect(res.state?.players[0].jailTurns).toBe(1);
    });

    it('allows jailed player to pay bail and get released', () => {
      const initialMoney = playingState.players[0].money;
      const action: GameAction = {
        actionId: 'act_pay_jail',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'PAY_JAIL'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[0].isJailed).toBe(false);
      expect(res.state?.players[0].money).toBe(initialMoney - 100);
      expect(res.events?.[0].type).toBe('JAIL_STATUS');
    });
  });

  describe('4. Property Purchase, Pass & Rent Mechanics', () => {
    let playingState: GameState;

    beforeEach(() => {
      const startRes = applyGameAction(
        initialState,
        { actionId: 'act_start', roomId: initialState.roomId, playerId: 'player_host', type: 'START_GAME' },
        hostActor
      );
      playingState = startRes.state!;
    });

    it('sets pendingAction: BUY_PROPERTY when landing on unowned property', () => {
      // Tile 1 is usually Adana (property)
      const mockRng = () => [1, 0] as any; // Lands on tile 1
      const res = applyGameAction(
        playingState,
        { actionId: 'act_land_prop', roomId: playingState.roomId, playerId: 'player_host', type: 'ROLL_DICE' },
        hostActor,
        { rng: () => [0, 1] }
      );

      expect(res.success).toBe(true);
      expect(res.state?.pendingAction).toBe('BUY_PROPERTY');
      expect(res.state?.actionMessage).toContain('satın almak ister misiniz');
    });

    it('completes property purchase and deducts funds', () => {
      playingState.pendingAction = 'BUY_PROPERTY';
      playingState.players[0].position = 1;
      const tile = playingState.board[1];
      const initialMoney = playingState.players[0].money;

      const action: GameAction = {
        actionId: 'act_buy_prop',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'BUY_PROPERTY'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.board[1].ownerId).toBe('player_host');
      expect(res.state?.players[0].money).toBe(initialMoney - (tile.price || 0));
      expect(res.state?.pendingAction).toBe('NONE');
      expect(res.events?.[0].type).toBe('PROPERTY_PURCHASED');
    });

    it('rejects BUY_PROPERTY if player has insufficient funds', () => {
      playingState.pendingAction = 'BUY_PROPERTY';
      playingState.players[0].position = 1;
      playingState.players[0].money = 10; // Not enough for property

      const action: GameAction = {
        actionId: 'act_buy_broke',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'BUY_PROPERTY'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('INSUFFICIENT_FUNDS');
    });

    it('automatically charges rent when landing on opponent owned property', () => {
      // Player guest owns tile 1
      playingState.board[1].ownerId = 'player_guest';
      const guestInitialMoney = playingState.players[1].money;
      const hostInitialMoney = playingState.players[0].money;

      const res = applyGameAction(
        playingState,
        { actionId: 'act_land_rent', roomId: playingState.roomId, playerId: 'player_host', type: 'ROLL_DICE' },
        hostActor,
        { rng: () => [0, 1] }
      );

      expect(res.success).toBe(true);
      expect(res.state?.players[0].money).toBeLessThan(hostInitialMoney);
      expect(res.state?.players[1].money).toBeGreaterThan(guestInitialMoney);
      expect(res.events?.some(e => e.type === 'RENT_PAID')).toBe(true);
    });
  });

  describe('5. Turn End & Advancement', () => {
    let playingState: GameState;

    beforeEach(() => {
      const startRes = applyGameAction(
        initialState,
        { actionId: 'act_start', roomId: initialState.roomId, playerId: 'player_host', type: 'START_GAME' },
        hostActor
      );
      playingState = startRes.state!;
    });

    it('rejects END_TURN if dice was not rolled', () => {
      const action: GameAction = {
        actionId: 'act_end_noroll',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'END_TURN'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('DICE_NOT_ROLLED');
    });

    it('rejects END_TURN if a pending action is unresolved', () => {
      playingState.diceRolled = true;
      playingState.pendingAction = 'BUY_PROPERTY';

      const action: GameAction = {
        actionId: 'act_end_pending',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'END_TURN'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('INVALID_ACTION');
    });

    it('advances turn to next player when valid', () => {
      playingState.diceRolled = true;
      playingState.pendingAction = 'NONE';

      const action: GameAction = {
        actionId: 'act_end_valid',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'END_TURN'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.currentTurnIndex).toBe(1);
      expect(res.state?.diceRolled).toBe(false);
      expect(res.events?.[0].type).toBe('TURN_CHANGED');
    });
  });

  describe('6. House Building, Selling & Mortgage', () => {
    let playingState: GameState;

    beforeEach(() => {
      const startRes = applyGameAction(
        initialState,
        { actionId: 'act_start', roomId: initialState.roomId, playerId: 'player_host', type: 'START_GAME' },
        hostActor
      );
      playingState = startRes.state!;

      // Give player_host monopoly on brown group (tiles 1, 2, and 3)
      playingState.board[1].ownerId = 'player_host';
      playingState.board[2].ownerId = 'player_host';
      playingState.board[3].ownerId = 'player_host';
    });

    it('builds a house when player has monopoly and funds', () => {
      const initialMoney = playingState.players[0].money;
      const houseCost = playingState.board[1].houseCost || 50;

      const action: GameAction = {
        actionId: 'act_build_1',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'BUILD_HOUSE',
        payload: { tileId: 1 }
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.board[1].houses).toBe(1);
      expect(res.state?.players[0].money).toBe(initialMoney - houseCost);
    });

    it('sells a house and refunds 50% of house cost', () => {
      playingState.board[1].houses = 2;
      const initialMoney = playingState.players[0].money;
      const houseCost = playingState.board[1].houseCost || 50;
      const refund = Math.floor(houseCost / 2);

      const action: GameAction = {
        actionId: 'act_sell_1',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'SELL_HOUSE',
        payload: { tileId: 1 }
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.board[1].houses).toBe(1);
      expect(res.state?.players[0].money).toBe(initialMoney + refund);
    });

    it('mortgages property and gives 50% property value', () => {
      playingState.board[1].houses = 0;
      const initialMoney = playingState.players[0].money;
      const propPrice = playingState.board[1].price || 100;
      const mortgageVal = Math.floor(propPrice / 2);

      const action: GameAction = {
        actionId: 'act_mortgage_1',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'MORTGAGE',
        payload: { tileId: 1 }
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.board[1].isMortgaged).toBe(true);
      expect(res.state?.players[0].money).toBe(initialMoney + mortgageVal);
    });
  });

  describe('7. Bankruptcy & Game Over Mechanics', () => {
    let playingState: GameState;

    beforeEach(() => {
      const startRes = applyGameAction(
        initialState,
        { actionId: 'act_start', roomId: initialState.roomId, playerId: 'player_host', type: 'START_GAME' },
        hostActor
      );
      playingState = startRes.state!;
      playingState.board[1].ownerId = 'player_guest';
    });

    it('processes bankruptcy and declares sole survivor the winner', () => {
      const action: GameAction = {
        actionId: 'act_bankrupt_guest',
        roomId: playingState.roomId,
        playerId: 'player_guest',
        type: 'BANKRUPTCY'
      };

      const res = applyGameAction(playingState, action, guestActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[1].inGame).toBe(false);
      expect(res.state?.board[1].ownerId).toBeUndefined(); // Clears ownership to bank
      expect(res.state?.phase).toBe('ENDED');
      expect(res.state?.winner?.id).toBe('player_host');
    });
  });

  describe('8. Anti-Cheat & Payload Tampering Verification', () => {
    let playingState: GameState;

    beforeEach(() => {
      const startRes = applyGameAction(
        initialState,
        { actionId: 'act_start', roomId: initialState.roomId, playerId: 'player_host', type: 'START_GAME' },
        hostActor
      );
      playingState = startRes.state!;
    });

    it('rejects action if unauthenticated actor tries to act on behalf of another player', () => {
      const action: GameAction = {
        actionId: 'act_hacked_action',
        roomId: playingState.roomId,
        playerId: 'player_host', // Pretending to be host
        type: 'BUY_PROPERTY'
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = applyGameAction(playingState, action, hackerActor);
        expect(res.success).toBe(false);
        expect(res.error).toBe('UNAUTHORIZED_PLAYER');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('ignores client-sent position/money injections in action payload', () => {
      const mockRng = () => [1, 2] as [number, number]; // Server roll = 3
      const action: GameAction = {
        actionId: 'act_tampered_payload',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'ROLL_DICE',
        payload: {
          position: 25, // Malicious target position
          money: 999999, // Malicious balance
          dice: [6, 6] // Malicious dice
        }
      };

      const res = applyGameAction(playingState, action, hostActor, { rng: mockRng });
      expect(res.success).toBe(true);
      expect(res.state?.players[0].position).toBe(3); // Calculated from 0 + (1+2)
      expect(res.state?.players[0].money).toBe(1500); // Unchanged, not 999999
      expect(res.state?.dice).toEqual([1, 2]); // Injected mock, not [6, 6]
    });
  });
});
