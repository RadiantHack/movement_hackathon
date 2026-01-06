# Blockchain Interactions Audit - TSX Files

This document lists all `.tsx` files that contain direct blockchain interactions that should potentially be abstracted into hooks, utilities, or services.

## Files with Direct Blockchain Interactions

### 1. **Page Files**

#### `app/bridge/page.tsx`

**Interactions:**

- Creates `Aptos` instance directly (lines 70-72)
- Builds transaction: `aptos.transaction.build.simple()` (line 283)
- Signs transaction: `generateSigningMessageForTransaction()` (line 311)
- Creates authenticators: `Ed25519PublicKey`, `Ed25519Signature`, `AccountAuthenticatorEd25519` (lines 322-327)
- Submits transaction: `aptos.transaction.submit.simple()` (line 330)
- Waits for transaction: `aptos.waitForTransaction()` (line 336)

**Recommendation:** Extract to `utils/bridge/index.ts` or `hooks/useBridge.ts`

---

#### `app/transfer/page.tsx`

**Interactions:**

- Creates `Aptos` instance directly (lines 35-40)
- Uses `executeTransfer` utility (line 121) - ✅ Already abstracted

**Status:** Partially abstracted (uses utility function)

---

### 2. **Component Files**

#### `app/components/bridge/BridgeForm.tsx`

**Interactions:**

- Creates `Aptos` instance directly (lines 61-66)
- Builds transaction: `aptos.transaction.build.simple()` (line 193)
- Signs transaction: `generateSigningMessageForTransaction()` (line 219)
- Creates authenticators: `Ed25519PublicKey`, `Ed25519Signature`, `AccountAuthenticatorEd25519` (lines 228-233)
- Submits transaction: `aptos.transaction.submit.simple()` (line 235)
- Waits for transaction: `aptos.waitForTransaction()` (line 240)

**Recommendation:** Extract to `utils/bridge/index.ts` or `hooks/useBridge.ts`

---

#### `app/components/transfer-form.tsx`

**Interactions:**

- Creates `Aptos` instance directly (lines 44-49)
- Uses `executeTransfer` utility (line 166) - ✅ Already abstracted

**Status:** Partially abstracted (uses utility function)

---

#### `app/components/features/transfer/TransferCard.tsx`

**Interactions:**

- Creates `Aptos` instance directly (lines 50-57)
- Builds transaction: `aptos.transaction.build.simple()` (line 157)
- Signs transaction: `generateSigningMessageForTransaction()` (line 182)
- Creates authenticators: `Ed25519PublicKey`, `Ed25519Signature`, `AccountAuthenticatorEd25519` (lines 193-198)
- Submits transaction: `aptos.transaction.submit.simple()` (line 201)
- Waits for transaction: `aptos.waitForTransaction()` (line 207)

**Recommendation:** Use existing `utils/transfer/index.ts` instead of duplicating logic

---

#### `app/components/features/swap/SwapCard.tsx`

**Interactions:**

- Creates `Aptos` instance directly (lines 52-57)
- Uses `executeSwap` utility (line 438) - ✅ Already abstracted

**Status:** Partially abstracted (uses utility function)

---

#### `app/components/payment-modal.tsx`

**Interactions:**

- Creates `Aptos` instance directly (lines 108-112)
- Builds transaction: `aptos.transaction.build.simple()` (line 145)
- Signs transaction: `generateSigningMessageForTransaction()` (line 166)
- Creates authenticators: `Ed25519PublicKey`, `Ed25519Signature`, `AccountAuthenticatorEd25519` (lines 178-183)
- Submits transaction via x402 payment header (lines 194-218)

**Recommendation:** Extract payment transaction logic to `utils/payment/index.ts`

---

#### `app/components/supply-modal.tsx`

**Interactions:**

- Calls `executeLendV2` and `executeRedeemV2` from `utils/lend-v2-utils.ts` (lines 1167-1194)
- ✅ Already abstracted to utility functions

**Status:** ✅ Properly abstracted

---

#### `app/components/borrow-modal.tsx`

**Interactions:**

- Likely uses utility functions (needs verification)

**Status:** Needs verification

---

#### `app/components/features/borrow/BorrowCard.tsx`

**Interactions:**

- Needs verification

**Status:** Needs verification

---

## Summary

### Files Requiring Refactoring (High Priority)

1. ~~**`app/bridge/page.tsx`**~~ - ✅ **FIXED** - Now uses `utils/bridge/index.ts`
2. ~~**`app/components/bridge/BridgeForm.tsx`**~~ - ✅ **FIXED** - Now uses `utils/bridge/index.ts`
3. ~~**`app/components/features/transfer/TransferCard.tsx`**~~ - ✅ **FIXED** - Now uses `utils/transfer/index.ts` and `utils/aptos-client.ts`
4. **`app/components/payment-modal.tsx`** - Payment transaction logic should be abstracted

### Files Already Abstracted (Good)

1. **`app/transfer/page.tsx`** - Uses `utils/transfer/index.ts` ✅
2. **`app/components/transfer-form.tsx`** - Uses `utils/transfer/index.ts` ✅
3. **`app/components/features/swap/SwapCard.tsx`** - Uses `utils/swap/index.ts` ✅ (Also uses `utils/aptos-client.ts` for Aptos instance)
4. **`app/components/supply-modal.tsx`** - Uses `utils/lend-v2-utils.ts` ✅
5. **`app/bridge/page.tsx`** - Uses `utils/bridge/index.ts` ✅ (Also uses `utils/aptos-client.ts`)
6. **`app/components/bridge/BridgeForm.tsx`** - Uses `utils/bridge/index.ts` ✅ (Also uses `utils/aptos-client.ts`)
7. **`app/components/features/transfer/TransferCard.tsx`** - Uses `utils/transfer/index.ts` ✅ (Also uses `utils/aptos-client.ts`)

### Recommended Actions

1. ~~**Create `utils/bridge/index.ts`**~~ - ✅ **COMPLETED** - Bridge transaction logic extracted
2. ~~**Refactor `TransferCard.tsx`**~~ - ✅ **COMPLETED** - Now uses `utils/transfer/index.ts` and `utils/aptos-client.ts`
3. **Create `utils/payment/index.ts`** - Extract payment transaction logic from `payment-modal.tsx`
4. ~~**Create shared Aptos instance utility**~~ - ✅ **COMPLETED** - Created `utils/aptos-client.ts`

## Pattern to Follow

All blockchain interactions should follow this pattern:

```typescript
// ❌ BAD: Direct interaction in component
const aptos = new Aptos(new AptosConfig({...}));
const rawTxn = await aptos.transaction.build.simple({...});
// ... signing, submission, etc.

// ✅ GOOD: Use utility function and shared Aptos client
import { createAptosClient } from '@/utils/aptos-client';
import { executeBridge } from '@/utils/bridge';

const aptos = createAptosClient({ movementFullNode: config.movementFullNode });
const txHash = await executeBridge({ aptos, ... });
```

## New Utilities Created

1. **`utils/bridge/index.ts`** - Bridge transaction execution utility
   - `executeBridge()` - Executes bridge transactions
   - `isValidEthereumAddress()` - Validates Ethereum addresses

2. **`utils/aptos-client.ts`** - Shared Aptos client utility
   - `createAptosClient()` - Creates Aptos instances with consistent configuration
