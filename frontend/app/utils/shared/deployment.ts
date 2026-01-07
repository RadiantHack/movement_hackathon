/**
 * Deployment Detection Utilities
 *
 * Provides utilities to detect the deployment environment (Railway, local, etc.)
 */

/**
 * Check if the application is deployed on Railway
 *
 * Railway sets the RAILWAY_ENVIRONMENT variable automatically.
 * We can also check for NEXT_PUBLIC_RAILWAY or RAILWAY environment variables.
 *
 * @returns true if deployed on Railway, false otherwise
 */
export const isRailwayDeployment = (): boolean => {
  // Check for Railway-specific environment variables
  // Railway automatically sets RAILWAY_ENVIRONMENT
  if (typeof window === "undefined") {
    // Server-side: check process.env directly
    return !!(
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY ||
      process.env.NEXT_PUBLIC_RAILWAY === "true" ||
      process.env.NEXT_PUBLIC_IS_RAILWAY === "true"
    );
  } else {
    // Client-side: check for NEXT_PUBLIC_ prefixed variables
    return !!(
      process.env.NEXT_PUBLIC_RAILWAY === "true" ||
      process.env.NEXT_PUBLIC_IS_RAILWAY === "true" ||
      // Check if we're on a Railway domain (railway.app or railway.app subdomain)
      (typeof window !== "undefined" &&
        window.location.hostname.includes("railway.app"))
    );
  }
};

/**
 * Constant that determines if this is a Railway deployment
 *
 * This is a constant value that can be imported and used throughout the application.
 * Set NEXT_PUBLIC_IS_RAILWAY=true in your Railway environment variables to enable.
 *
 * @example
 * ```ts
 * import { IS_RAILWAY } from "@/app/utils/deployment";
 *
 * if (IS_RAILWAY) {
 *   // Railway-specific logic
 * }
 * ```
 */
export const IS_RAILWAY: boolean = isRailwayDeployment();

/**
 * Get the deployment environment name
 *
 * @returns "railway" if on Railway, "local" otherwise
 */
export const getDeploymentEnvironment = (): "railway" | "local" => {
  return IS_RAILWAY ? "railway" : "local";
};
