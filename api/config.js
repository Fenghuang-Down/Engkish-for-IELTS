// Public settings for the browser. The anon key is meant to be public: row-level security protects the data.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    aiEnabled: !!process.env.ANTHROPIC_API_KEY,
  });
}
