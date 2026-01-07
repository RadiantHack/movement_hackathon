/**
 * Services Index - Export all MovePosition-aligned services
 * Central export point for SDK context, portfolio, broker, and transaction services
 */

// SDK Context
export {
  getSDKContext,
  requireSDKContext,
  resetSDKContext,
  type SdkContext,
} from "./sdk-context";

// Portfolio Service
export {
  fetchPortfolioWithRisk,
  buildCurrentPortfolioBasicState,
  buildNextPortfolioState,
  fetchSimulatedPortfolio,
  calcHealthFactor,
  isRedZone,
  isYellowZone,
  shouldGetRiskEval,
  type BasicPosition,
  type PortfolioState,
  type SPortfolio,
} from "../services/portfolio-service";

// Broker Service
export {
  fetchBrokers,
  getBrokerByAssetName,
  getBrokerByNetworkAddress,
  getBrokerByDepositNote,
  getBrokerByLoanNote,
  validateBroker,
  getBrokerName,
  getCoinType,
  hasAvailableLiquidity,
  exceedsMaxDeposit,
  getBrokerNames,
  clearBrokerCache,
} from "../services/broker-service";

// Transaction Service
export {
  executeTransaction,
  TransactionService,
  type TransactionArgs,
  type TxType,
  type SignHashFunction,
  type ProgressCallback,
  type TxRequestPayload,
} from "../services/transaction-service";
