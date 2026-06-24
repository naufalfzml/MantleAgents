import { createClient } from '@supabase/supabase-js';
import type { Database } from './types.js';
import { getSupabaseOptions } from './options.js';

export function createSupabaseAdmin(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey, getSupabaseOptions());
}
