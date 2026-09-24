import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyGameAction,
  defaultCryptoRng,
  advanceServerTurn,
  AuthenticatedActor,
  ServerErrorCode
} from '../src/server/game/serverGameEngine';
import {
  createInitialState,
  JAIL_TILE_INDEX,
  TOTAL_TILES,
  calculatePlayerNetWorth,
  calculatePlayerRentIncome,
  formatGameDuration,
  calculateFinalRankings
} from '../src/engine/gameEngine';
import { GameState, Player, BoardTile, FinancialTransaction } from '../src/types/game';
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

  describe('9. Automated Debt Liquidation (AUTO_LIQUIDATE)', () => {
    let playingState: GameState;

    beforeEach(() => {
      const startRes = applyGameAction(
        initialState,
        { actionId: 'act_start', roomId: initialState.roomId, playerId: 'player_host', type: 'START_GAME' },
        hostActor
      );
      playingState = startRes.state!;
    });

    it('returns immediately if player is solvent (money >= 0)', () => {
      playingState.players[0].money = 200;
      playingState.pendingAction = 'DEBT_SETTLEMENT';

      const action: GameAction = {
        actionId: 'act_liq_1',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'AUTO_LIQUIDATE'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[0].money).toBe(200);
      expect(res.state?.pendingAction).toBe('NONE');
    });

    it('mortgages only the lowest-value property needed and stops immediately once solvent', () => {
      // Host has 2 properties: cheap property (price: 60 -> mortgage: 30) and valuable property (price: 400 -> mortgage: 200)
      playingState.board[1].ownerId = 'player_host'; // Adana (price 60)
      playingState.board[1].price = 60;
      playingState.board[1].houses = 0;
      playingState.board[1].isMortgaged = false;

      playingState.board[37].ownerId = 'player_host'; // Istanbul (price 400)
      playingState.board[37].price = 400;
      playingState.board[37].houses = 0;
      playingState.board[37].isMortgaged = false;

      // Host has -20₺ debt. Adana mortgage (+30₺) is sufficient!
      playingState.players[0].money = -20;
      playingState.pendingAction = 'DEBT_SETTLEMENT';

      const action: GameAction = {
        actionId: 'act_liq_2',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'AUTO_LIQUIDATE'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[0].money).toBe(10); // -20 + 30 = +10
      expect(res.state?.board[1].isMortgaged).toBe(true); // Adana mortgaged
      expect(res.state?.board[37].isMortgaged).toBe(false); // Istanbul untouched!
      expect(res.state?.pendingAction).toBe('NONE');
      expect(res.events?.some(e => e.type === 'MORTGAGE_TOGGLED' && e.tileId === 1)).toBe(true);
    });

    it('protects monopolies and mortgages non-monopoly property first', () => {
      // Host owns a monopoly on Brown (tiles 1, 2, 3) and single tile 6 (Light Blue)
      playingState.board[1].ownerId = 'player_host';
      playingState.board[1].colorGroup = 'brown';
      playingState.board[1].price = 60;
      playingState.board[1].houses = 0;
      playingState.board[1].isMortgaged = false;

      playingState.board[2].ownerId = 'player_host';
      playingState.board[2].colorGroup = 'brown';
      playingState.board[2].price = 60;
      playingState.board[2].houses = 0;
      playingState.board[2].isMortgaged = false;

      playingState.board[3].ownerId = 'player_host';
      playingState.board[3].colorGroup = 'brown';
      playingState.board[3].price = 80;
      playingState.board[3].houses = 0;
      playingState.board[3].isMortgaged = false;

      playingState.board[6].ownerId = 'player_host';
      playingState.board[6].colorGroup = 'lightblue';
      playingState.board[6].price = 100; // Mortgage = 50
      playingState.board[6].houses = 0;
      playingState.board[6].isMortgaged = false;

      // Debt = -40. Tile 6 mortgage (+50) should be chosen before any brown monopoly tile!
      playingState.players[0].money = -40;

      const action: GameAction = {
        actionId: 'act_liq_mono',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'AUTO_LIQUIDATE'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.board[6].isMortgaged).toBe(true);
      expect(res.state?.board[1].isMortgaged).toBe(false);
      expect(res.state?.board[2].isMortgaged).toBe(false);
      expect(res.state?.board[3].isMortgaged).toBe(false);
      expect(res.state?.players[0].money).toBe(10); // -40 + 50 = 10
    });

    it('sells houses evenly when mortgage is insufficient', () => {
      // Host owns monopoly on Brown with 2 houses on tile 1 and 3 houses on tile 2
      playingState.board[1].ownerId = 'player_host';
      playingState.board[1].colorGroup = 'brown';
      playingState.board[1].price = 100;
      playingState.board[1].houseCost = 100;
      playingState.board[1].houses = 2;
      playingState.board[1].isMortgaged = false;

      playingState.board[2].ownerId = 'player_host';
      playingState.board[2].colorGroup = 'brown';
      playingState.board[2].price = 100;
      playingState.board[2].houseCost = 100;
      playingState.board[2].houses = 3;
      playingState.board[2].isMortgaged = false;

      // Debt = -40. Selling 1 house from tile 2 (highest house count: 3 -> 2) yields +50
      playingState.players[0].money = -40;

      const action: GameAction = {
        actionId: 'act_liq_house',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'AUTO_LIQUIDATE'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[0].money).toBe(10); // -40 + 50 = +10
      expect(res.state?.board[2].houses).toBe(2); // Reduced from 3 to 2
      expect(res.state?.board[1].houses).toBe(2); // Untouched
      expect(res.events?.some(e => e.type === 'HOUSE_SOLD' && e.tileId === 2)).toBe(true);
    });

    it('sells properties to bank at 2/3 refund when all mortgages and house sales are exhausted', () => {
      // Tile 1 is already mortgaged, no other money
      playingState.board[1].ownerId = 'player_host';
      playingState.board[1].price = 120;
      playingState.board[1].houses = 0;
      playingState.board[1].isMortgaged = true;

      // Debt = -50. Bank sale gives 120 * 2/3 = 80
      playingState.players[0].money = -50;

      const action: GameAction = {
        actionId: 'act_liq_bank',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'AUTO_LIQUIDATE'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[0].money).toBe(30); // -50 + 80 = 30
      expect(res.state?.board[1].ownerId).toBeUndefined(); // Sold to bank
    });

    it('declares bankruptcy when all assets are insufficient to cover debt', () => {
      // Total assets: Tile 1 (price 60 -> mortgage 30, bank sale 40)
      playingState.board[1].ownerId = 'player_host';
      playingState.board[1].price = 60;
      playingState.board[1].houses = 0;
      playingState.board[1].isMortgaged = false;

      // Debt = -1000. Assets total ~70, cannot cover -1000!
      playingState.players[0].money = -1000;

      const action: GameAction = {
        actionId: 'act_liq_bankrupt',
        roomId: playingState.roomId,
        playerId: 'player_host',
        type: 'AUTO_LIQUIDATE'
      };

      const res = applyGameAction(playingState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[0].inGame).toBe(false);
      expect(res.state?.phase).toBe('ENDED');
      expect(res.state?.winner?.id).toBe('player_guest');
      expect(res.events?.some(e => e.type === 'BANKRUPTCY')).toBe(true);
    });
  });

  describe('New Chance Cards: SEND_TO_JAIL and DEMOLISH_BUILDING', () => {
    let chanceState: GameState;

    beforeEach(() => {
      chanceState = createInitialState();
      chanceState.players = createTestPlayers();
      chanceState.hostPlayerId = 'user_host';
      chanceState.phase = 'PLAYING';
      chanceState.currentTurnIndex = 0; // Host's turn
      chanceState.diceRolled = true;
      chanceState.pendingAction = 'CHANCE_CARD';
    });

    it('successfully sends selected target player to jail with SEND_TO_JAIL card', () => {
      chanceState.activeCard = {
        id: 'c16',
        title: 'Bir Oyuncuyu Kodese Gönder',
        description: 'İstediğiniz bir rakip oyuncuyu doğrudan Kodese gönderin!',
        actionType: 'SEND_TO_JAIL'
      };

      const action: GameAction = {
        actionId: 'act_jail_1',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE',
        payload: { targetPlayerId: 'player_guest' }
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[1].isJailed).toBe(true);
      expect(res.state?.players[1].jailTurns).toBe(0);
      expect(res.state?.players[1].position).toBe(JAIL_TILE_INDEX);
      expect(res.state?.players[0].isJailed).toBe(false); // Host is NOT jailed
      expect(res.state?.pendingAction).toBe('NONE');
      expect(res.events?.some(e => e.type === 'JAIL_STATUS' && e.targetPlayerId === 'player_guest')).toBe(true);
    });

    it('rejects targeting oneself with SEND_TO_JAIL', () => {
      chanceState.activeCard = {
        id: 'c16',
        title: 'Bir Oyuncuyu Kodese Gönder',
        description: 'İstediğiniz bir rakip oyuncuyu doğrudan Kodese gönderin!',
        actionType: 'SEND_TO_JAIL'
      };

      const action: GameAction = {
        actionId: 'act_jail_self',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE',
        payload: { targetPlayerId: 'player_host' }
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('INVALID_TARGET');
    });

    it('rejects targeting an already jailed player with SEND_TO_JAIL', () => {
      chanceState.players[1].isJailed = true;
      chanceState.activeCard = {
        id: 'c16',
        title: 'Bir Oyuncuyu Kodese Gönder',
        description: 'İstediğiniz bir rakip oyuncuyu doğrudan Kodese gönderin!',
        actionType: 'SEND_TO_JAIL'
      };

      const action: GameAction = {
        actionId: 'act_jail_already',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE',
        payload: { targetPlayerId: 'player_guest' }
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('INVALID_TARGET');
    });

    it('completes cleanly when no eligible opponents exist for SEND_TO_JAIL', () => {
      chanceState.players[1].isJailed = true; // No free opponent
      chanceState.activeCard = {
        id: 'c16',
        title: 'Bir Oyuncuyu Kodese Gönder',
        description: 'İstediğiniz bir rakip oyuncuyu doğrudan Kodese gönderin!',
        actionType: 'SEND_TO_JAIL'
      };

      const action: GameAction = {
        actionId: 'act_jail_none',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE'
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.pendingAction).toBe('NONE');
    });

    it('bot automatically selects wealthiest opponent for SEND_TO_JAIL', () => {
      chanceState.players[0].isBot = true;
      chanceState.players[1].money = 2500;
      chanceState.activeCard = {
        id: 'c16',
        title: 'Bir Oyuncuyu Kodese Gönder',
        description: 'İstediğiniz bir rakip oyuncuyu doğrudan Kodese gönderin!',
        actionType: 'SEND_TO_JAIL'
      };

      const action: GameAction = {
        actionId: 'act_jail_bot',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE'
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.players[1].isJailed).toBe(true);
    });

    it('successfully demolishes 1 building on opponent property with DEMOLISH_BUILDING card and provides NO refund', () => {
      chanceState.board[1].ownerId = 'player_guest';
      chanceState.board[1].houses = 3;
      const initialGuestMoney = chanceState.players[1].money;

      chanceState.activeCard = {
        id: 'c17',
        title: 'Bir Yapıyı Yık',
        description: 'Bir rakibinizin mülkündeki 1 adet yapıyı yıkın!',
        actionType: 'DEMOLISH_BUILDING'
      };

      const action: GameAction = {
        actionId: 'act_demo_1',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE',
        payload: { tileId: 1 }
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.board[1].houses).toBe(2); // Reduced from 3 to 2
      expect(res.state?.players[1].money).toBe(initialGuestMoney); // NO cash refund!
      expect(res.state?.pendingAction).toBe('NONE');
      expect(res.events?.some(e => e.type === 'HOUSE_SOLD' && e.tileId === 1 && e.amount === 0)).toBe(true);
    });

    it('rejects demolishing on own property', () => {
      chanceState.board[1].ownerId = 'player_host';
      chanceState.board[1].houses = 2;

      chanceState.activeCard = {
        id: 'c17',
        title: 'Bir Yapıyı Yık',
        description: 'Bir rakibinizin mülkündeki 1 adet yapıyı yıkın!',
        actionType: 'DEMOLISH_BUILDING'
      };

      const action: GameAction = {
        actionId: 'act_demo_own',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE',
        payload: { tileId: 1 }
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('INVALID_PROPERTY');
    });

    it('rejects demolishing on property with 0 houses', () => {
      chanceState.board[1].ownerId = 'player_guest';
      chanceState.board[1].houses = 0;

      chanceState.activeCard = {
        id: 'c17',
        title: 'Bir Yapıyı Yık',
        description: 'Bir rakibinizin mülkündeki 1 adet yapıyı yıkın!',
        actionType: 'DEMOLISH_BUILDING'
      };

      const action: GameAction = {
        actionId: 'act_demo_zero',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE',
        payload: { tileId: 1 }
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(false);
      expect(res.error).toBe('INVALID_PROPERTY');
    });

    it('completes cleanly when no opponent properties have buildings', () => {
      chanceState.activeCard = {
        id: 'c17',
        title: 'Bir Yapıyı Yık',
        description: 'Bir rakibinizin mülkündeki 1 adet yapıyı yıkın!',
        actionType: 'DEMOLISH_BUILDING'
      };

      const action: GameAction = {
        actionId: 'act_demo_nobuildings',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE'
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.pendingAction).toBe('NONE');
    });

    it('bot automatically selects highest rent opponent property for DEMOLISH_BUILDING', () => {
      chanceState.players[0].isBot = true;
      chanceState.board[1].ownerId = 'player_guest';
      chanceState.board[1].houses = 1;
      chanceState.board[1].rent = [10, 40, 100, 200, 300, 450];

      chanceState.board[3].ownerId = 'player_guest';
      chanceState.board[3].houses = 4;
      chanceState.board[3].rent = [20, 80, 200, 400, 600, 900];

      chanceState.activeCard = {
        id: 'c17',
        title: 'Bir Yapıyı Yık',
        description: 'Bir rakibinizin mülkündeki 1 adet yapıyı yıkın!',
        actionType: 'DEMOLISH_BUILDING'
      };

      const action: GameAction = {
        actionId: 'act_demo_bot',
        roomId: chanceState.roomId,
        playerId: 'player_host',
        type: 'CONFIRM_CHANCE'
      };

      const res = applyGameAction(chanceState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.board[3].houses).toBe(3); // Picked tile 3 with 4 houses
    });
  });

  describe('Game Over & Final Statistics Calculations', () => {
    let testPlayers: Player[];
    let testBoard: BoardTile[];

    beforeEach(() => {
      const state = createInitialState();
      testPlayers = createTestPlayers();
      testBoard = state.board;
    });

    it('accurately calculates player net worth with cash, properties, and buildings', () => {
      testPlayers[0].money = 1200;
      testBoard[1].ownerId = 'player_host';
      testBoard[1].price = 200;
      testBoard[1].houses = 3;
      testBoard[1].houseCost = 100;
      testBoard[1].isMortgaged = false;

      testBoard[2].ownerId = 'player_host';
      testBoard[2].price = 300;
      testBoard[2].houses = 0;
      testBoard[2].isMortgaged = true; // Mortgage value = 150

      // Net worth = 1200 + (200 + 3*100) + (150) = 1200 + 500 + 150 = 1850
      const netWorth = calculatePlayerNetWorth(testPlayers[0], testBoard);
      expect(netWorth).toBe(1850);
    });

    it('returns 0 net worth for eliminated bankrupt player', () => {
      testPlayers[0].inGame = false;
      testPlayers[0].money = -500;
      const netWorth = calculatePlayerNetWorth(testPlayers[0], testBoard);
      expect(netWorth).toBe(0);
    });

    it('calculates total rent income from transactions history', () => {
      const transactions: FinancialTransaction[] = [
        {
          id: 'tx1',
          playerId: 'player_host',
          playerName: 'Host Player',
          playerAvatar: '🏎️',
          playerColor: '#EF4444',
          type: 'income',
          category: 'rent_in',
          amount: 250,
          balanceAfter: 1750,
          description: 'Rent from guest',
          timestamp: '12:00'
        },
        {
          id: 'tx2',
          playerId: 'player_host',
          playerName: 'Host Player',
          playerAvatar: '🏎️',
          playerColor: '#EF4444',
          type: 'income',
          category: 'salary',
          amount: 200,
          balanceAfter: 1950,
          description: 'Passed GO',
          timestamp: '12:05'
        },
        {
          id: 'tx3',
          playerId: 'player_host',
          playerName: 'Host Player',
          playerAvatar: '🏎️',
          playerColor: '#EF4444',
          type: 'income',
          category: 'rent_in',
          amount: 300,
          balanceAfter: 2250,
          description: 'Rent from bot',
          timestamp: '12:10'
        },
        {
          id: 'tx4',
          playerId: 'player_guest',
          playerName: 'Guest Player',
          playerAvatar: '🎩',
          playerColor: '#3B82F6',
          type: 'income',
          category: 'rent_in',
          amount: 100,
          balanceAfter: 1600,
          description: 'Rent from host',
          timestamp: '12:15'
        }
      ];

      const hostRent = calculatePlayerRentIncome('player_host', transactions);
      expect(hostRent).toBe(550); // 250 + 300

      const guestRent = calculatePlayerRentIncome('player_guest', transactions);
      expect(guestRent).toBe(100);
    });

    it('formats game duration correctly in TR and EN', () => {
      const durationMs = 12 * 60 * 1000 + 45 * 1000; // 12m 45s
      expect(formatGameDuration(durationMs, 'tr')).toBe('12dk 45sn');
      expect(formatGameDuration(durationMs, 'en')).toBe('12m 45s');
    });

    it('calculates deterministic final ranking placing winner at #1 and ordering by net worth', () => {
      testPlayers[0].money = 2000;
      testPlayers[1].money = 3500;

      // Without winner specified, guest has higher cash/net worth
      const ranksNoWinner = calculateFinalRankings(testPlayers, testBoard);
      expect(ranksNoWinner[0].player.id).toBe('player_guest');
      expect(ranksNoWinner[0].rank).toBe(1);

      // With host as explicit winner (even if lower cash), winner is always #1
      const ranksWithWinner = calculateFinalRankings(testPlayers, testBoard, 'player_host');
      expect(ranksWithWinner[0].player.id).toBe('player_host');
      expect(ranksWithWinner[0].rank).toBe(1);
      expect(ranksWithWinner[0].isWinner).toBe(true);
      expect(ranksWithWinner[1].player.id).toBe('player_guest');
      expect(ranksWithWinner[1].rank).toBe(2);
    });

    it('allows host to restart game (TEKRAR OYNA) from ENDED phase cleanly', () => {
      const endedState = createInitialState();
      endedState.players = createTestPlayers();
      endedState.hostPlayerId = 'user_host';
      endedState.phase = 'ENDED';
      endedState.winner = endedState.players[0];
      endedState.players[1].inGame = false;
      endedState.board[1].ownerId = 'player_host';
      endedState.board[1].houses = 3;

      const action: GameAction = {
        actionId: 'act_replay_1',
        roomId: endedState.roomId,
        playerId: 'player_host',
        type: 'START_GAME'
      };

      const res = applyGameAction(endedState, action, hostActor);
      expect(res.success).toBe(true);
      expect(res.state?.phase).toBe('PLAYING');
      expect(res.state?.winner).toBeUndefined();
      expect(res.state?.players[0].money).toBe(1500);
      expect(res.state?.players[1].money).toBe(1500);
      expect(res.state?.players[1].inGame).toBe(true); // Restored to active
      expect(res.state?.board[1].ownerId).toBeUndefined(); // Fresh clean board
      expect(res.state?.board[1].houses).toBe(0);
      expect(res.events?.some(e => e.type === 'GAME_STARTED')).toBe(true);
    });
  });
});
