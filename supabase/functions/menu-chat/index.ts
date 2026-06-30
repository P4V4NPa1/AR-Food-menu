const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type MenuContext = {
  menu?: Array<Record<string, unknown>>;
  curryProteins?: Array<Record<string, unknown>>;
  currySauces?: Array<Record<string, unknown>>;
  locations?: Array<Record<string, unknown>>;
  arModels?: string[];
};

function trimContext(context: MenuContext) {
  return {
    menu: (context.menu || []).slice(0, 80),
    curryProteins: context.curryProteins || [],
    currySauces: context.currySauces || [],
    locations: context.locations || [],
    arModels: context.arModels || []
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) {
    return new Response(JSON.stringify({ error: 'OPENAI_API_KEY is not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const question = String(body.question || '').trim().slice(0, 800);
    const context = trimContext(body.context || {});

    if (!question) {
      return new Response(JSON.stringify({ error: 'Question is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 450,
        messages: [
          {
            role: 'system',
            content: 'You are the Curry Leaves menu assistant on a restaurant website. Answer clearly and briefly using only the provided menu, variants, locations, order flow, and AR model context. If the user asks unrelated general questions, politely redirect to restaurant/menu help. Mention allergy uncertainty and advise calling staff for serious allergies. Do not invent prices, dishes, locations, or policies.'
          },
          {
            role: 'user',
            content: `Menu context JSON:\n${JSON.stringify(context)}\n\nCustomer question: ${question}`
          }
        ]
      })
    });

    if (!openAiRes.ok) {
      return new Response(JSON.stringify({ error: await openAiRes.text() }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await openAiRes.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || '';

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
