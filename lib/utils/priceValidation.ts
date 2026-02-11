/**
 * PRICE DATA VALIDATION
 *
 * Validates price data before rendering to prevent:
 * - Race conditions
 * - Stale data
 * - Invalid values
 * - Missing required fields
 */

import type { PriceData } from '@/stores/useSymbolPriceStore';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PriceValidationOptions {
  /** Maximum age in milliseconds (default: 30000 = 30s) */
  maxAge?: number;
  /** Minimum valid price (default: 0) */
  minPrice?: number;
  /** Maximum valid price (default: Infinity) */
  maxPrice?: number;
  /** Require volume data (default: false) */
  requireVolume?: boolean;
  /** Allow negative prices (default: false) */
  allowNegative?: boolean;
}

const DEFAULT_OPTIONS: Required<PriceValidationOptions> = {
  maxAge: 30000, // 30 seconds
  minPrice: 0,
  maxPrice: Infinity,
  requireVolume: false,
  allowNegative: false,
};

/**
 * Validates a single price data object
 */
export function validatePriceData(
  data: PriceData | null | undefined,
  options: PriceValidationOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const errors: string[] = [];
  const warnings: string[] = [];

  // Null check
  if (!data) {
    errors.push('Price data is null or undefined');
    return { isValid: false, errors, warnings };
  }

  // Required fields
  if (!data.symbol || typeof data.symbol !== 'string') {
    errors.push('Missing or invalid symbol');
  }

  if (typeof data.price !== 'number') {
    errors.push('Missing or invalid price');
  } else {
    // Price validation
    if (isNaN(data.price) || !isFinite(data.price)) {
      errors.push('Price is NaN or Infinity');
    }

    if (!opts.allowNegative && data.price < 0) {
      errors.push(`Negative price not allowed: ${data.price}`);
    }

    if (data.price < opts.minPrice) {
      errors.push(`Price ${data.price} below minimum ${opts.minPrice}`);
    }

    if (data.price > opts.maxPrice) {
      errors.push(`Price ${data.price} above maximum ${opts.maxPrice}`);
    }
  }

  if (typeof data.timestamp !== 'number') {
    errors.push('Missing or invalid timestamp');
  } else {
    // Timestamp validation
    const age = Date.now() - data.timestamp;

    if (age < 0) {
      warnings.push('Timestamp is in the future');
    }

    if (age > opts.maxAge) {
      warnings.push(`Data is stale (${Math.round(age / 1000)}s old)`);
    }
  }

  // Optional fields validation
  if (opts.requireVolume && typeof data.volume24h !== 'number') {
    warnings.push('Missing volume data');
  }

  if (data.change24h !== undefined && (isNaN(data.change24h) || !isFinite(data.change24h))) {
    warnings.push('Invalid change24h value');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates multiple price data objects
 */
export function validatePriceDataBatch(
  dataArray: (PriceData | null | undefined)[],
  options: PriceValidationOptions = {}
): {
  valid: PriceData[];
  invalid: Array<{ data: PriceData | null | undefined; result: ValidationResult }>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    stale: number;
  };
} {
  const valid: PriceData[] = [];
  const invalid: Array<{ data: PriceData | null | undefined; result: ValidationResult }> = [];
  let staleCount = 0;

  dataArray.forEach((data) => {
    const result = validatePriceData(data, options);

    if (result.isValid) {
      valid.push(data!);
      if (result.warnings.some((w) => w.includes('stale'))) {
        staleCount++;
      }
    } else {
      invalid.push({ data, result });
    }
  });

  return {
    valid,
    invalid,
    summary: {
      total: dataArray.length,
      valid: valid.length,
      invalid: invalid.length,
      stale: staleCount,
    },
  };
}

/**
 * Sanitizes price data by removing invalid values
 */
export function sanitizePriceData(data: Partial<PriceData>): PriceData | null {
  try {
    // Required fields
    if (!data.symbol || typeof data.price !== 'number') {
      return null;
    }

    // Sanitize price
    let price = data.price;
    if (isNaN(price) || !isFinite(price) || price < 0) {
      return null;
    }

    // Sanitize timestamp
    const timestamp = data.timestamp ?? Date.now();

    // Build clean object
    const clean: PriceData = {
      symbol: data.symbol.toLowerCase(),
      price,
      timestamp,
    };

    // Optional fields (only include if valid)
    if (typeof data.change24h === 'number' && isFinite(data.change24h)) {
      clean.change24h = data.change24h;
    }

    if (typeof data.volume24h === 'number' && isFinite(data.volume24h) && data.volume24h >= 0) {
      clean.volume24h = data.volume24h;
    }

    if (typeof data.high24h === 'number' && isFinite(data.high24h) && data.high24h >= 0) {
      clean.high24h = data.high24h;
    }

    if (typeof data.low24h === 'number' && isFinite(data.low24h) && data.low24h >= 0) {
      clean.low24h = data.low24h;
    }

    return clean;
  } catch (error) {
    console.error('[PriceValidation] Sanitization error:', error);
    return null;
  }
}

/**
 * Checks if price data is stale
 */
export function isPriceStale(data: PriceData | null | undefined, maxAge: number = 30000): boolean {
  if (!data || typeof data.timestamp !== 'number') {
    return true;
  }

  const age = Date.now() - data.timestamp;
  return age > maxAge;
}

/**
 * Formats validation result for logging
 */
export function formatValidationResult(result: ValidationResult): string {
  const parts: string[] = [];

  if (result.isValid) {
    parts.push('✅ Valid');
  } else {
    parts.push('❌ Invalid');
  }

  if (result.errors.length > 0) {
    parts.push(`Errors: ${result.errors.join(', ')}`);
  }

  if (result.warnings.length > 0) {
    parts.push(`Warnings: ${result.warnings.join(', ')}`);
  }

  return parts.join(' | ');
}
