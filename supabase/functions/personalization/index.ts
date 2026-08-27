const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      accepted: false,
      error: 'desktop_owned',
      message: 'Personalization is computed by the Electron autonomous runtime; this endpoint is reserved for controlled remote persistence access.',
    }),
    {
      status: 409,
      headers: { ...corsHeaders, 'content-type': 'application/json' },
    },
  );
});
