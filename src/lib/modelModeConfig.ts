/**
 * Configuration management for different operation modes
 * Each mode (Promociones, Shelf Promotions, Shelf SKU) has its own independent model configuration
 */

export type OperationMode = "promociones" | "shelf_promotions" | "shelf_sku";

export type ModeModelConfig = {
  ocr_model?: string;
  vision_model?: string;
  semantic_model?: string;
  custom_settings?: Record<string, unknown>;
};

const STORAGE_PREFIX = "ocr_mode_config_";

/**
 * Get the stored model configuration for a specific mode
 */
export function getModeModelConfig(accountName: string, mode: OperationMode): ModeModelConfig {
  const key = `${STORAGE_PREFIX}${accountName}_${mode}`;
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

/**
 * Save the model configuration for a specific mode
 */
export function setModeModelConfig(
  accountName: string,
  mode: OperationMode,
  config: ModeModelConfig,
): void {
  const key = `${STORAGE_PREFIX}${accountName}_${mode}`;
  localStorage.setItem(key, JSON.stringify(config));
}

/**
 * Clear configuration for a specific mode
 */
export function clearModeModelConfig(accountName: string, mode: OperationMode): void {
  const key = `${STORAGE_PREFIX}${accountName}_${mode}`;
  localStorage.removeItem(key);
}

/**
 * Get all saved configurations for an account
 */
export function getAllModeConfigs(accountName: string): Record<OperationMode, ModeModelConfig> {
  const modes: OperationMode[] = ["promociones", "shelf_promotions", "shelf_sku"];
  return modes.reduce(
    (acc, mode) => {
      acc[mode] = getModeModelConfig(accountName, mode);
      return acc;
    },
    {} as Record<OperationMode, ModeModelConfig>,
  );
}

/**
 * Ensure each mode has independent config (migrate if needed)
 */
export function ensureModeConfigIsolation(accountName: string): void {
  const modes: OperationMode[] = ["promociones", "shelf_promotions", "shelf_sku"];
  const configs = getAllModeConfigs(accountName);

  // If no configs exist, create empty ones for all modes
  if (Object.values(configs).every((c) => Object.keys(c).length === 0)) {
    modes.forEach((mode) => {
      setModeModelConfig(accountName, mode, {});
    });
  }
}
