function publicSupabaseConfig() {
  return {
    url: process.env.RECORDPATH_SUPABASE_URL || process.env.SUPABASE_URL || "",
    anonKey: process.env.RECORDPATH_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ""
  };
}

export default function handler(req, res) {
  const config = publicSupabaseConfig();
  res.status(200).json({
    url: config.url,
    anonKey: config.anonKey,
    configured: Boolean(config.url && config.anonKey)
  });
}
