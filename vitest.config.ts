import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/clientMigration.test.ts',
      'test/controlledRolloutValidation.test.ts',
      'test/securityParityAudit.test.ts',
      'test/serverActionEndpoint.test.ts',
      'test/serverGameEngine.test.ts',
      'test/multiplayerStressEdgeCases.test.ts',
      'test/replacementBotTakeover.test.ts'
    ]
  }
});
