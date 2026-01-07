# Frontend Unused Code Analysis Report

## Summary
This report identifies functions, components, and utilities that are exported but not imported or used anywhere in the frontend codebase.

## Unused Components

### 1. `PrivyExample` Component
**Location:** `frontend/app/components/privy-example.tsx`
**Status:** ❌ **UNUSED**
- Exported but never imported anywhere
- Appears to be an example/demo component
- **Recommendation:** Remove if not needed, or move to examples folder

### 2. `LendForm` Component
**Location:** `frontend/app/components/features/lendform/form.tsx`
**Status:** ❌ **UNUSED**
- Exported default component but never imported
- Contains minimal placeholder code
- **Recommendation:** Remove if not needed for future development

## Unused Utility Functions

### 3. `formatAddress` Function
**Location:** `frontend/app/utils/validation.ts`
**Status:** ❌ **UNUSED**
- Exported function for formatting addresses (truncated display)
- Not imported anywhere in the codebase
- **Recommendation:** Remove or use if address formatting is needed elsewhere

### 4. `getTokenInfo` Function
**Location:** `frontend/app/utils/tokens.ts`
**Status:** ✅ **REMOVED**
- ~~Exported function to get token info by symbol~~
- ~~Only the `TokenInfo` type is imported, not the function~~
- ~~Note: Similar functionality exists in `token-constants.ts` (`getTokenBySymbol`)~~
- **Status:** Function has been removed

### 5. `getTokenById` Function
**Location:** `frontend/app/utils/token-constants.ts`
**Status:** ⚠️ **INTERNALLY USED ONLY**
- Exported but only used internally within the same file
- Not imported by any other files
- **Recommendation:** Consider making it private/internal if not needed externally

### 6. `normalizeTokenSymbol` Function
**Location:** `frontend/app/utils/token-constants.ts`
**Status:** ⚠️ **INTERNALLY USED ONLY**
- Exported but only used internally by `getTokenBySymbol`
- Not imported by any other files
- **Recommendation:** Consider making it private/internal if not needed externally

## Example/Reference Files

### 7. `lending-transaction.example.ts`
**Location:** `frontend/app/utils/lending-transaction.example.ts`
**Status:** 📝 **EXAMPLE FILE** (Expected to be unused)
- Contains example usage patterns
- Not imported anywhere (by design)
- **Recommendation:** Keep if used for documentation/reference, otherwise remove

## Internal-Only Functions

### 8. `buildCurrentPortfolioBasicState` Function
**Location:** `frontend/app/utils/lending-transaction.ts`
**Status:** ⚠️ **INTERNALLY USED ONLY**
- Exported but only called internally within the same file
- Not imported by any other files
- **Recommendation:** Consider making it private/internal if not needed externally

## All Validation Functions Status ✅

All validation functions are being used:
- ✅ `validateMovePositionAmount` - Used in MovePosition hooks
- ✅ `validateMovePositionWallet` - Used in MovePosition hooks
- ✅ `validateMovePositionAsset` - Used in MovePosition hooks
- ✅ `validateMovePositionBorrowingPower` - Used in MovePosition borrow hook
- ✅ `validateSwapAmount` - Used in swap hook
- ✅ `validateTokenPair` - Used in swap hook
- ✅ `validateMovementAddress` - Used in transfer components and API
- ✅ `validateTransferAmount` - Used in transfer components
- ✅ `validateEchelonAmount` - Used in Echelon hooks
- ✅ `validateEchelonWallet` - Used in Echelon hooks
- ✅ `validateEchelonAsset` - Used in Echelon hooks
- ✅ `validateBorrowingPower` - Used in Echelon hooks

## All Hook Functions Status ✅

All custom hooks are being used:
- ✅ `useMovePositionWithdraw` - Used in components
- ✅ `useMovePositionSupply` - Used in components
- ✅ `useMovePositionRepay` - Used in components
- ✅ `useMovePositionBorrow` - Used in components
- ✅ `useEchelonWithdraw` - Used in components
- ✅ `useEchelonSupply` - Used in components
- ✅ `useEchelonRepay` - Used in components
- ✅ `useEchelonBorrow` - Used in components
- ✅ `useEchelonTransactions` - Used by Echelon hooks
- ✅ `useEchelonVault` - Used in Echelon page and chat
- ✅ `useTransfer` - Used in transfer components
- ✅ `useSwap` - Used in swap components

## Recommendations

### High Priority (Safe to Remove)
1. **Remove `PrivyExample` component** - Clearly unused example component
2. **Remove `LendForm` component** - Placeholder with no usage
3. **Remove `formatAddress` function** - No imports found
4. ~~**Remove `getTokenInfo` and `isNativeToken`**~~ ✅ **COMPLETED** - Functions have been removed

### Medium Priority (Consider Refactoring)
5. **Make `getTokenById` and `normalizeTokenSymbol` internal** - Only used within same file
6. **Make `buildCurrentPortfolioBasicState` internal** - Only used within same file

### Low Priority (Keep for Reference)
7. **Keep `lending-transaction.example.ts`** - Useful for documentation if actively maintained

## Notes

- All validation utilities are actively used and should be kept
- All custom hooks are actively used and should be kept
- The `tokens.ts` file appears to be a legacy/alternative implementation to `token-constants.ts`
- Consider consolidating token utilities if `tokens.ts` is not needed

