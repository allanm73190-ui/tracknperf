import { supabase } from "../../infra/supabase/client";

export type EngineContext = {
  planVersionId: string | null;
  configProfileId: string | null;
  algorithmVersionId: string | null;
  algorithmVersion: string;
  config: unknown;
};

export async function loadEngineContext(args: {
  planId: string;
  planVersionId: string | null;
}): Promise<EngineContext> {
  if (!supabase) throw new Error("Supabase is not configured.");

  let planVersionId = args.planVersionId;

  if (!planVersionId) {
    const { data, error } = await supabase
      .from("plan_versions")
      .select("id")
      .eq("plan_id", args.planId)
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Could not load plan version. (${error.message})`);
    planVersionId = data?.[0]?.id ? String(data[0].id) : null;
  }

  if (!planVersionId) {
    return {
      planVersionId: null,
      configProfileId: null,
      algorithmVersionId: null,
      algorithmVersion: "v1.1.0",
      config: { version: "v1.1-default" },
    };
  }

  const { data: pv, error: pvErr } = await supabase
    .from("plan_versions")
    .select("id, config_profile_id, algorithm_version_id")
    .eq("id", planVersionId)
    .maybeSingle();
  if (pvErr) throw new Error(`Could not load plan version metadata. (${pvErr.message})`);

  const configProfileId = pv?.config_profile_id ? String(pv.config_profile_id) : null;
  const algorithmVersionId = pv?.algorithm_version_id ? String(pv.algorithm_version_id) : null;

  let config: unknown = { version: "v1.1-default" };
  if (configProfileId) {
    const { data: cfg, error: cfgErr } = await supabase
      .from("config_profiles")
      .select("config")
      .eq("id", configProfileId)
      .maybeSingle();
    if (cfgErr) throw new Error(`Could not load config profile. (${cfgErr.message})`);
    config = cfg?.config ?? config;
  }

  let algorithmVersion = "v1.1.0";
  if (algorithmVersionId) {
    const { data: av, error: avErr } = await supabase
      .from("algorithm_versions")
      .select("version")
      .eq("id", algorithmVersionId)
      .maybeSingle();
    if (avErr) throw new Error(`Could not load algorithm version. (${avErr.message})`);
    if (av?.version) algorithmVersion = String(av.version);
  }

  return { planVersionId, configProfileId, algorithmVersionId, algorithmVersion, config };
}

