/**
 * Post-quantum account configuration read from environment variables.
 *
 * Set in .env (repo root):
 *   NEXT_PUBLIC_PQ_FACTORY_ADDRESS = 0x...   (ZKNOX factory)
 *   NEXT_PUBLIC_BUNDLER_URL = https://...            (ERC-4337 bundler)
 *
 * POST_QUANTUM_SEED and AGENT_PRIVATE_KEY (PRE_QUANTUM_SEED) are secrets —
 * never expose them to the browser. Pass them only from server-side code or scripts.
 */
export const PQ_FACTORY_ADDRESS: string = process.env.NEXT_PUBLIC_PQ_FACTORY_ADDRESS ?? "";
export const BUNDLER_URL: string = process.env.NEXT_PUBLIC_BUNDLER_URL ?? "";

/** Standard ERC-4337 EntryPoint v0.7 (all networks). */
export const ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
