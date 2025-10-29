// functions/index.js (ESM)
// Export production functions

import { createTransakSession } from './createTransakSession.js';
import { handleTransakWebhook } from './handleTransakWebhook.js';
import { handleFireblocksWebhook } from './handleFireblocksWebhook.js';
import { generateUserTag } from './generateUserTag.js';
import { createStripeCheckoutSession } from './createStripeCheckoutSession.js';
import {
  fireblocksPing as _fireblocksPing,
  fireblocksCreateOrGetVaults as _fireblocksCreateOrGetVaults,
  fireblocksCreateDepositHandle as _fireblocksCreateDepositHandle,
  fireblocksXrplTransferTest as _fireblocksXrplTransferTest,
} from './fireblocks.js';

export { createTransakSession, handleTransakWebhook, handleFireblocksWebhook, generateUserTag, createStripeCheckoutSession };
export const fireblocksPing = _fireblocksPing;
export const fireblocksCreateOrGetVaults = _fireblocksCreateOrGetVaults;
export const fireblocksCreateDepositHandle = _fireblocksCreateDepositHandle;
export const fireblocksXrplTransferTest = _fireblocksXrplTransferTest;
