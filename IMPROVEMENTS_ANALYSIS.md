# Balance Transfer Code Analysis & Improvements

## 🔍 Analysis Summary

This document identifies duplications and improvements needed in the balance transfer functionality across the codebase.

---

## ❌ Major Duplications Found

### 1. **Wallet Extraction Logic** (HIGH PRIORITY)
**Duplicated in 20+ files:**
- `transfer-form.tsx` (lines 56-66)
- `transfer/page.tsx` (lines 47-57)
- `TransferCard.tsx` (lines 56-66)
- `overview/page.tsx` (lines 36-50)
- `chat/page.tsx` (lines 17-66)
- `swap/page.tsx` (lines 19-44)
- And many more...

**Duplicated Pattern:**
```typescript
const movementWallet = useMemo(() => {
  if (!ready || !authenticated || !user?.linkedAccounts) {
    return null;
  }
  return (
    user.linkedAccounts.find(
      (account): account is WalletWithMetadata =>
        account.type === "wallet" && account.chainType === "aptos"
    ) || null
  );
}, [user, ready, authenticated]);
```

**✅ Solution:** Created `useMovementWallet()` hook
- **File:** `frontend/app/hooks/useMovementWallet.ts`
- **Usage:** Replace all duplicated wallet extraction with `const movementWallet = useMovementWallet();`

---

### 2. **Address Validation** (MEDIUM PRIORITY)
**Duplicated in:**
- `transfer-form.tsx` (line 136)
- `TransferCard.tsx` (line 110)
- Multiple other files

**Duplicated Pattern:**
```typescript
if (!toAddress || !toAddress.startsWith("0x") || toAddress.length !== 66) {
  setTransferError("Please enter a valid recipient address (66 characters, starting with 0x).");
  return;
}
```

**✅ Solution:** Created `validateMovementAddress()` utility
- **File:** `frontend/app/utils/validation.ts`
- **Features:**
  - Validates format (0x prefix, 66 chars)
  - Validates hex characters
  - Returns structured error messages

---

### 3. **Transfer Handler Logic** (HIGH PRIORITY)
**Duplicated in:**
- `transfer-form.tsx` (lines 120-191)
- `transfer/page.tsx` (lines 87-150)
- `TransferCard.tsx` (lines 68-184)

**Common Duplicated Patterns:**
1. Wallet validation
2. Address validation
3. Amount validation
4. Error handling
5. Balance refresh after transfer
6. Transaction state management

**✅ Solution:** Created `useTransfer()` hook
- **File:** `frontend/app/hooks/useTransfer.ts`
- **Features:**
  - Centralized validation
  - Consistent error handling
  - Automatic balance refresh
  - State management (transferring, error, txHash)

---

### 4. **Amount Validation** (LOW PRIORITY)
**Duplicated in:**
- `transfer-form.tsx` (line 131)
- `transfer/page.tsx` (line 88)
- `TransferCard.tsx` (implicit)

**✅ Solution:** Created `validateTransferAmount()` utility
- **File:** `frontend/app/utils/validation.ts`
- **Features:**
  - Validates numeric format
  - Checks for positive values
  - Optional balance checking

---

## 🚨 Missing Features

### 1. **Balance Validation Before Transfer**
**Issue:** None of the transfer handlers check if user has sufficient balance before attempting transfer.

**Current Behavior:**
- Transfer attempts even if balance is insufficient
- Error only appears after transaction fails

**✅ Solution:** Added balance validation in `useTransfer()` hook
- Checks `amount <= selectedToken.formattedAmount`
- Shows clear error message before attempting transfer

---

### 2. **Inconsistent Error Messages**
**Issue:** Different error messages across components for the same errors.

**Examples:**
- `transfer-form.tsx`: "Please select a token and ensure wallet is connected."
- `transfer/page.tsx`: "Please connect a Movement wallet"
- `TransferCard.tsx`: "Movement wallet not found. Please create a Movement wallet first."

**✅ Solution:** Standardized error messages in `useTransfer()` hook

---

## 📋 Implementation Checklist

### Phase 1: Core Utilities (✅ COMPLETED)
- [x] Create `useMovementWallet()` hook
- [x] Create `validateMovementAddress()` utility
- [x] Create `validateTransferAmount()` utility
- [x] Create `useTransfer()` hook

### Phase 2: Refactor Components (TODO)
- [ ] Refactor `transfer-form.tsx` to use new hooks
- [ ] Refactor `transfer/page.tsx` to use new hooks
- [ ] Refactor `TransferCard.tsx` to use new hooks
- [ ] Update other components using wallet extraction

### Phase 3: Testing (TODO)
- [ ] Test transfer functionality with new hooks
- [ ] Test validation utilities
- [ ] Test error handling
- [ ] Test balance validation

---

## 🔧 How to Use New Utilities

### 1. Using `useMovementWallet()` Hook

**Before:**
```typescript
const movementWallet = useMemo(() => {
  if (!ready || !authenticated || !user?.linkedAccounts) {
    return null;
  }
  return (
    user.linkedAccounts.find(
      (account): account is WalletWithMetadata =>
        account.type === "wallet" && account.chainType === "aptos"
    ) || null
  );
}, [user, ready, authenticated]);
```

**After:**
```typescript
import { useMovementWallet } from "../hooks/useMovementWallet";

const movementWallet = useMovementWallet();
```

---

### 2. Using Address Validation

**Before:**
```typescript
if (!toAddress || !toAddress.startsWith("0x") || toAddress.length !== 66) {
  setTransferError("Please enter a valid recipient address (66 characters, starting with 0x).");
  return;
}
```

**After:**
```typescript
import { validateMovementAddress } from "../utils/validation";

const addressValidation = validateMovementAddress(toAddress);
if (!addressValidation.isValid) {
  setTransferError(addressValidation.error);
  return;
}
```

---

### 3. Using `useTransfer()` Hook

**Before:**
```typescript
const handleTransfer = async () => {
  // 50+ lines of validation and transfer logic
  // Duplicated across multiple files
};
```

**After:**
```typescript
import { useTransfer } from "../hooks/useTransfer";

const { transferring, error, txHash, handleTransfer } = useTransfer({
  aptos,
  movementChainId,
  onSuccess: () => {
    // Handle success
  },
  onError: (error) => {
    // Handle error
  },
});

// In your component:
await handleTransfer(selectedToken, toAddress, amount);
```

---

## 📊 Impact Analysis

### Code Reduction
- **Before:** ~150 lines of duplicated code per component
- **After:** ~10 lines per component using hooks
- **Savings:** ~140 lines per component × 3 components = **~420 lines removed**

### Maintainability
- ✅ Single source of truth for wallet extraction
- ✅ Consistent validation logic
- ✅ Centralized error handling
- ✅ Easier to add new features (e.g., transaction history)

### Testing
- ✅ Easier to test isolated utilities
- ✅ Mock hooks for component testing
- ✅ Test validation logic independently

---

## 🎯 Next Steps

1. **Refactor `transfer-form.tsx`**
   - Replace wallet extraction with `useMovementWallet()`
   - Replace transfer handler with `useTransfer()`
   - Use validation utilities

2. **Refactor `transfer/page.tsx`**
   - Same changes as above

3. **Refactor `TransferCard.tsx`**
   - Same changes as above

4. **Update other components**
   - Replace wallet extraction in all components using `useMovementWallet()`

5. **Add tests**
   - Unit tests for validation utilities
   - Integration tests for `useTransfer()` hook
   - Component tests with mocked hooks

---

## 📝 Notes

- All new utilities follow TypeScript best practices
- Error messages are user-friendly and consistent
- Validation includes edge cases (empty strings, invalid formats, etc.)
- Hooks are memoized for performance
- Balance validation prevents unnecessary transaction attempts

