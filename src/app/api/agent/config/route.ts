// The device agent asks for this once when it pairs. Both values are already public in the app's
// own JavaScript; Row Level Security and the device token protect the data.
export function GET() {
  return Response.json({
    supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? null,
  });
}
