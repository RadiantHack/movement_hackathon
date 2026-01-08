/**
 * EchelonClient wrapper for interacting with Echelon protocol
 * Based on the official Echelon SDK: https://github.com/EchelonMarket/echelon-sdk
 */

import {
  createSurfClient,
  createViewPayload,
  DefaultABITable,
} from "@thalalabs/surf";
import { LENDING_ASSETS_ABI } from "./abi/lending_assets";
import { Aptos } from "@aptos-labs/ts-sdk";
import { fp64ToFloat } from "./utils/fp64ToFloat";
import { LENDING_SCRIPTS_ABI } from "./abi/lending_scripts";

/**
 * Echelon contract address on Movement Network
 * Note: The ABI files have a different address hardcoded, but we override it here
 * to use the correct contract address that matches our transaction execution
 */
export const ECHELON_CONTRACT_ADDRESS =
  "0x6a01d5761d43a5b5a0ccbfc42edf2d02c0611464aae99a2ea0e0d4819f0550b5" as `0x${string}`;

/**
 * EchelonClient class for interacting with the Echelon protocol
 */
export class EchelonClient {
  aptos: Aptos;
  address: `0x${string}`;
  surfClient: ReturnType<typeof createSurfClient<DefaultABITable>>;

  /**
   * Creates an instance of EchelonClient.
   *
   * @param {Aptos} aptos - The Aptos instance to interact with the blockchain.
   * @param {`0x${string}`} contractAddress - The address of the Echelon contract.
   */
  constructor(
    aptos: Aptos,
    contractAddress: `0x${string}` = ECHELON_CONTRACT_ADDRESS
  ) {
    this.aptos = aptos;
    this.surfClient = createSurfClient(this.aptos);
    this.address = contractAddress;
  }

  /**
   * Retrieves the borrowable amount of a coin for a specified account in a market.
   * This is the official on-chain method that returns the exact max borrowable amount.
   *
   * @param {string} account - The address of the account.
   * @param {string} market - The market identifier (market address).
   * @returns {Promise<number>} A promise that resolves to the borrowable amount in raw units (u64).
   */
  async getAccountBorrowable(account: string, market: string): Promise<number> {
    // Override the ABI address with the correct contract address
    const result = await this.surfClient.view({
      payload: createViewPayload(
        {
          ...LENDING_ASSETS_ABI,
          address: this.address,
        },
        {
          function: "account_borrowable_coins",
          functionArguments: [
            account as `0x${string}`,
            market as `0x${string}`,
          ],
          typeArguments: [],
          address: this.address,
        }
      ),
    });
    return Number(result[0]);
  }

  /**
   * Retrieves the coin price.
   *
   * @param {string} market - The market identifier.
   * @returns {Promise<number>} A promise that resolves to the coin price.
   */
  async getCoinPrice(market: string): Promise<number> {
    // Override the ABI address with the correct contract address
    const result = await this.surfClient.view({
      payload: createViewPayload(
        {
          ...LENDING_ASSETS_ABI,
          address: this.address,
        },
        {
          function: "asset_price",
          functionArguments: [market as `0x${string}`],
          typeArguments: [],
          address: this.address,
        }
      ),
    });
    return fp64ToFloat(BigInt((result[0] as { v: string }).v));
  }

  /**
   * Retrieves the supplied amount of a coin for a specified account in a market.
   *
   * @param {string} account - The address of the account.
   * @param {string} market - The market identifier.
   * @returns {Promise<number>} A promise that resolves to the supplied amount.
   */
  async getAccountSupply(account: string, market: string): Promise<number> {
    // Override the ABI address with the correct contract address
    const result = await this.surfClient.view({
      payload: createViewPayload(
        {
          ...LENDING_ASSETS_ABI,
          address: this.address,
        },
        {
          function: "account_coins",
          functionArguments: [
            account as `0x${string}`,
            market as `0x${string}`,
          ],
          typeArguments: [],
          address: this.address,
        }
      ),
    });
    return Number(result[0]);
  }

  /**
   * Retrieves the liability amount of a coin for a specified account in a market.
   *
   * @param {string} account - The address of the account.
   * @param {string} market - The market identifier.
   * @returns {Promise<number>} A promise that resolves to the liability amount.
   */
  async getAccountLiability(account: string, market: string): Promise<number> {
    // Override the ABI address with the correct contract address
    const result = await this.surfClient.view({
      payload: createViewPayload(
        {
          ...LENDING_ASSETS_ABI,
          address: this.address,
        },
        {
          function: "account_liability",
          functionArguments: [
            account as `0x${string}`,
            market as `0x${string}`,
          ],
          typeArguments: [],
          address: this.address,
        }
      ),
    });
    return Number(result[0]);
  }

  /**
   * Retrieves the withdrawable amount of a coin for a specified account in a market.
   * This is the official on-chain method that returns the exact max withdrawable amount.
   *
   * @param {string} account - The address of the account.
   * @param {string} market - The market identifier (market address).
   * @returns {Promise<number>} A promise that resolves to the withdrawable amount in raw units (u64).
   */
  async getAccountWithdrawable(
    account: string,
    market: string
  ): Promise<number> {
    // Override the ABI address with the correct contract address
    const result = await this.surfClient.view({
      payload: createViewPayload(
        {
          ...LENDING_ASSETS_ABI,
          address: this.address,
        },
        {
          function: "account_withdrawable_coins",
          functionArguments: [
            account as `0x${string}`,
            market as `0x${string}`,
          ],
          typeArguments: [],
          address: this.address,
        }
      ),
    });
    return Number(result[0]);
  }
}
