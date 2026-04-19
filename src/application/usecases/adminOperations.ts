import { supabase } from "../../infra/supabase/client";

export type ConfigProfileRow = { id: string; key: string; name: string };
export type AlgorithmVersionRow = { id: string; version: string };
export type AdminData = {
  configProfiles: ConfigProfileRow[];
  algoVersions: AlgorithmVersionRow[];
};

export async function loadAdminData(): Promise<AdminData> {
  if (!supabase) throw new Error("Supabase is not configured.");

  const { data: cfg, error: cfgErr } = await supabase
    .from("config_profiles")
    .select("id, key, name")
    .order("created_at", { ascending: false });
  if (cfgErr) throw new Error(cfgErr.message);

  const { data: av, error: avErr } = await supabase
    .from("algorithm_versions")
    .select("id, version")
    .order("created_at", { ascending: false });
  if (avErr) throw new Error(avErr.message);

  return {
    configProfiles: (cfg ?? []).map((r) => ({ id: String(r.id), key: String(r.key), name: String(r.name) })),
    algoVersions: (av ?? []).map((r) => ({ id: String(r.id), version: String(r.version) })),
  };
}

export async function createConfigProfile(key: string, name: string, config: unknown): Promise<ConfigProfileRow> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("config_profiles")
    .insert({ key, name, config })
    .select("id, key, name")
    .single();
  if (error) throw new Error(error.message);
  return { id: String(data.id), key: String(data.key), name: String(data.name) };
}

export async function createAlgorithmVersion(version: string): Promise<AlgorithmVersionRow> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase
    .from("algorithm_versions")
    .insert({ version, metadata: {} })
    .select("id, version")
    .single();
  if (error) throw new Error(error.message);
  return { id: String(data.id), version: String(data.version) };
}
