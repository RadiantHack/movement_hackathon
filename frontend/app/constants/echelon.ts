/**
 * Echelon Protocol Constants
 * Market addresses, symbol mappings, and configuration
 */

/**
 * Maps Echelon market addresses to their corresponding token symbols
 * Used for identifying assets in user positions and market data
 */
export const MARKET_TO_SYMBOL: Record<string, string> = {
  "0x568f96c4ed010869d810abcf348f4ff6b66d14ff09672fb7b5872e4881a25db7": "MOVE",
  "0x789d7711b7979d47a1622692559ccd221ef7c35bb04f8762dadb5cc70222a0a0": "USDC",
  "0x8191d4b8c0fc0af511b3c56c555528a3e74b7f3cfab3047df9ebda803f3bc3d2": "USDT",
  "0xa24e2eaacf9603538af362f44dfcf9d411363923b9206260474abfaa8abebee4": "WBTC",
  "0x6889932d2ff09c9d299e72b23a62a7f07af807789c98141d08475701e7b21b7c": "WETH",
  "0x62cb5f64b5a9891c57ff12d38fbab141e18c3d63e859a595ff6525b4221eaf23": "LBTC",
  "0x185f42070ab2ca5910ebfdea83c9f26f4015ad2c0f5c8e6ca1566d07c6c60aca":
    "SolvBTC",
  "0x8dd513b2bb41f0180f807ecaa1e0d2ddfacd57bf739534201247deca13f3542": "ezETH",
  "0x481fe68db505bc15973d0014c35217726efd6ee353d91a2a9faaac201f3423d": "sUSDe",
  "0x4cbeca747528f340ef9065c93dea0cc1ac8a46b759e31fc8b8d04bc52a86614b": "rsETH",
};
