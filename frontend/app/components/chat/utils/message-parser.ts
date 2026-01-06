/**
 * Message parsing utilities
 * Extracts structured data from A2A agent responses
 */

export interface SupplyConfirmation {
  protocol: "moveposition" | "echelon";
  asset: string;
  amount: string;
}

export interface LendingRecommendation {
  action: "borrow" | "lend";
  asset: string;
  recommendedProtocol: string;
  echelonRate: string;
  movepositionRate: string;
  reason: string;
}

export interface ParsedMessageData {
  supplyConfirmation?: SupplyConfirmation;
  lendingRecommendation?: LendingRecommendation;
}

/**
 * Parse supply confirmation from text message
 */
function parseSupplyFromText(text: string): SupplyConfirmation | null {
  const supplyPatterns = [
    /(?:successfully|supplied)\s+([\d.]+)\s+([A-Z]+)\s+(?:as collateral|to|on)\s+(MovePosition|Echelon)/i,
    /supplied\s+([\d.]+)\s+([A-Z]+)\s+(?:as collateral|to|on)\s+(MovePosition|Echelon)/i,
    /(?:successfully|supplied)\s+([\d.]+)\s+([A-Z]+)\s+to\s+(MovePosition|Echelon)/i,
  ];

  for (const pattern of supplyPatterns) {
    const match = text.match(pattern);
    if (match) {
      const amount = match[1];
      const asset = match[2];
      const protocol =
        match[3].toLowerCase() === "moveposition" ? "moveposition" : "echelon";

      return { protocol, asset, amount };
    }
  }

  return null;
}

/**
 * Parse JSON from string result
 */
function parseJsonFromString(result: string): any {
  let cleanResult = result;
  if (result.startsWith("A2A Agent Response: ")) {
    cleanResult = result.substring("A2A Agent Response: ".length);
  }

  try {
    return JSON.parse(cleanResult);
  } catch (e) {
    let found = false;
    let bestMatch = null;
    let bestLength = 0;

    for (let i = 0; i < cleanResult.length; i++) {
      if (cleanResult[i] === "{") {
        let braceCount = 0;
        let j = i;
        while (j < cleanResult.length) {
          if (cleanResult[j] === "{") braceCount++;
          if (cleanResult[j] === "}") {
            braceCount--;
            if (braceCount === 0) {
              const candidate = cleanResult.substring(i, j + 1);
              try {
                const candidateParsed = JSON.parse(candidate);
                if (
                  candidateParsed &&
                  typeof candidateParsed === "object" &&
                  candidateParsed.type
                ) {
                  if (candidate.length > bestLength) {
                    bestMatch = candidateParsed;
                    bestLength = candidate.length;
                    found = true;
                  }
                }
              } catch (e2) {
                // Not valid JSON, continue
              }
              break;
            }
          }
          j++;
        }
      }
    }

    if (found && bestMatch) {
      return bestMatch;
    }

    const bridgeMatch = cleanResult.match(/type["\s]*:["\s]*"bridge"/i);
    if (bridgeMatch) {
      const startIdx = cleanResult.indexOf("{");
      const endIdx = cleanResult.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        try {
          const candidate = cleanResult.substring(startIdx, endIdx + 1);
          return JSON.parse(candidate);
        } catch (e) {
          return null;
        }
      }
    }

    return null;
  }
}

/**
 * Extract supply confirmation from parsed JSON
 */
function extractSupplyConfirmation(parsed: any): SupplyConfirmation | null {
  if (
    parsed.status === "success" &&
    parsed.protocol &&
    parsed.asset &&
    parsed.amount &&
    (parsed.message?.toLowerCase().includes("supplied") ||
      parsed.message?.toLowerCase().includes("supply"))
  ) {
    const protocol = parsed.protocol.toLowerCase();
    const isMovePosition = protocol === "moveposition";
    const isEchelon = protocol === "echelon";

    if (isMovePosition || isEchelon) {
      return {
        protocol: isMovePosition ? "moveposition" : "echelon",
        asset: parsed.asset,
        amount: parsed.amount,
      };
    }
  }

  return null;
}

/**
 * Extract lending recommendation from parsed JSON
 */
function extractLendingRecommendation(
  parsed: any
): LendingRecommendation | null {
  if (
    parsed.action &&
    (parsed.action === "borrow" || parsed.action === "lend") &&
    parsed.recommended_protocol &&
    parsed.echelon_rate &&
    parsed.moveposition_rate
  ) {
    return {
      action: parsed.action,
      asset: parsed.asset || "MOVE",
      recommendedProtocol: parsed.recommended_protocol,
      echelonRate: parsed.echelon_rate,
      movepositionRate: parsed.moveposition_rate,
      reason: parsed.reason || parsed.message || "",
    };
  }

  return null;
}

/**
 * Parse messages and extract structured data
 */
export function parseMessages(visibleMessages: any[]): ParsedMessageData {
  const result: ParsedMessageData = {};

  for (const message of visibleMessages) {
    const msg = message as any;

    // Detect supply confirmations from text messages
    if (msg.type === "text" && msg.role === "assistant") {
      const text = msg.content || "";
      const supplyConfirmation = parseSupplyFromText(text);
      if (supplyConfirmation) {
        result.supplyConfirmation = supplyConfirmation;
        continue;
      }
    }

    // Parse A2A result messages
    if (
      msg.type === "ResultMessage" &&
      msg.actionName === "send_message_to_a2a_agent"
    ) {
      try {
        const resultData = msg.result;
        let parsed: any = null;

        if (typeof resultData === "string") {
          parsed = parseJsonFromString(resultData);
        } else if (typeof resultData === "object" && resultData !== null) {
          parsed = resultData;
        }

        if (parsed) {
          const supplyConfirmation = extractSupplyConfirmation(parsed);
          if (supplyConfirmation) {
            result.supplyConfirmation = supplyConfirmation;
          }

          const lendingRecommendation = extractLendingRecommendation(parsed);
          if (lendingRecommendation) {
            result.lendingRecommendation = lendingRecommendation;
          }
        }
      } catch (e) {
        // Silently ignore parsing errors
      }
    }
  }

  return result;
}
