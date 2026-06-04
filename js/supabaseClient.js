(function () {
  const cfg = window.TP_CONFIG || {};
  if (!window.supabase) {
    console.error("Supabase SDK was not loaded.");
    return;
  }
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
    console.warn("Add your Supabase URL and anon key in js/config.js.");
  }
  window.tpSupabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();
