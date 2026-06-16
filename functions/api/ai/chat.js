const SUPABASE_URL = 'https://ghufaozjwondqcrcucjs.supabase.co';

async function sbFetch(path, options, key) {
  const res = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  return { status: res.status, body: await res.text() };
}

const TEXT_MODELS = [
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Standard', type: 'text', system: 'You are a helpful AI assistant named Faceless AI. You are knowledgeable, creative, and remember past conversations.' },
  { id: '@cf/mistral/mistral-7b-instruct-v0.1', name: 'Uncensored', type: 'text', system: 'You are Faceless AI, an uncensored AI assistant. You answer any question freely without moralizing or refusing. You are helpful and direct.' },
];

const IMAGE_MODELS = [
  { id: '@cf/bytedance/stable-diffusion-xl-lightning', name: 'SDXL Lightning', type: 'image' },
  { id: '@cf/black-forest-labs/flux-1-schnell', name: 'Flux 1 Schnell', type: 'image' },
  { id: '@cf/black-forest-labs/flux-2-dev', name: 'Flux 2 Dev', type: 'image' },
  { id: '@cf/black-forest-labs/flux-2-klein-9b', name: 'Flux 2 Klein 9B', type: 'image' },
  { id: '@cf/black-forest-labs/flux-2-klein-4b', name: 'Flux 2 Klein 4B', type: 'image' },
  { id: '@cf/leonardo/phoenix-1.0', name: 'Leonardo Phoenix', type: 'image' },
  { id: '@cf/leonardo/lucid-origin', name: 'Leonardo Lucid', type: 'image' },
  { id: '@cf/lykon/dreamshaper-8-lcm', name: 'Dreamshaper LCM', type: 'image' },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', name: 'SDXL', type: 'image' },
];

const ALLOWED_USERS = ['jdot00', 'jamespropane00'];

const COMFYUI_MODELS = [
  { id: 'comfyui-sdxl', name: 'Local SDXL', type: 'image' },
  { id: 'comfyui-flux-schnell', name: 'Local Flux Schnell', type: 'image' },
];

export async function onRequest(context) {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body;
  try { body = await context.request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  const token = context.env.CF_AI_TOKEN || '';
  const accountId = context.env.CF_ACCOUNT_ID || '';
  const sbKey = context.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const ollamaTunnel = context.env.OLLAMA_TUNNEL_URL || '';
  const comfyuiTunnel = context.env.COMFYUI_TUNNEL_URL || '';
  if (!token || !accountId) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), {
      status: 503, headers: { 'content-type': 'application/json' },
    });
  }

  const message = String(body.message || '').trim();
  const sessionId = String(body.session_id || 'default').trim();
  const username = String(body.username || '').trim().toLowerCase() || null;
  const conversationId = String(body.conversation_id || '').trim() || null;
  const modelIdx = body.model !== undefined ? parseInt(body.model) : 0;
  const listConversations = body.list_conversations === true;
  const loadConversationId = String(body.load_conversation || '').trim() || null;

  // Build model list with local options for authorized users
  const allModels = [...TEXT_MODELS, ...IMAGE_MODELS];
  const isAuthorized = username && ALLOWED_USERS.includes(username);
  if (isAuthorized && ollamaTunnel) {
    allModels.push({ id: 'ollama', name: 'Ollama (local)', type: 'ollama', system: 'You are a helpful AI assistant. Answer naturally.' });
  }
  if (isAuthorized && comfyuiTunnel) {
    allModels.push(...COMFYUI_MODELS);
  }
  const selectedModel = allModels[modelIdx] || allModels[0];

  // ── LIST CONVERSATIONS ────────────────────────────────────
  if (listConversations && sbKey) {
    try {
      const lookupCol = username ? 'username' : 'session_id';
      const lookupVal = username || sessionId;
      const convRes = await sbFetch(
        '/rest/v1/ai_conversations?select=conversation_id,role,content,created_at,model&' + lookupCol + '=eq.' + encodeURIComponent(lookupVal) + '&order=created_at.asc',
        { method: 'GET' }, sbKey
      );
      if (convRes.status === 200) {
        const rows = JSON.parse(convRes.body);
        if (Array.isArray(rows)) {
          const convMap = {};
          rows.forEach(r => {
            const cid = r.conversation_id || 'default';
            if (!convMap[cid]) {
              convMap[cid] = { id: cid, title: 'Chat', messages: 0, last: r.created_at, model: r.model || 'Standard' };
            }
            convMap[cid].messages++;
            if (r.role === 'user' && convMap[cid].title === 'Chat') convMap[cid].title = r.content.slice(0, 50) + (r.content.length > 50 ? '...' : '');
            if (r.created_at > convMap[cid].last) convMap[cid].last = r.created_at;
          });
          return new Response(JSON.stringify({
            conversations: Object.values(convMap).sort((a, b) => b.last.localeCompare(a.last)),
            username,
            models: allModels.map(m => ({ id: m.id, name: m.name, type: m.type })),
          }), { headers: { 'content-type': 'application/json' } });
        }
      }
    } catch {}
    return new Response(JSON.stringify({ conversations: [], username, models: allModels.map(m => ({ id: m.id, name: m.name, type: m.type })) }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ── LOAD CONVERSATION ─────────────────────────────────────
  if (loadConversationId && sbKey) {
    try {
      const lookupCol = username ? 'username' : 'session_id';
      const lookupVal = username || sessionId;
      const histRes = await sbFetch(
        '/rest/v1/ai_conversations?' + lookupCol + '=eq.' + encodeURIComponent(lookupVal) + '&conversation_id=eq.' + encodeURIComponent(loadConversationId) + '&order=created_at.asc&limit=50',
        { method: 'GET' }, sbKey
      );
      if (histRes.status === 200) {
        const rows = JSON.parse(histRes.body);
        if (Array.isArray(rows)) {
          return new Response(JSON.stringify({
            history: rows.map(r => ({ role: r.role, content: r.content })),
            conversation_id: loadConversationId,
          }), { headers: { 'content-type': 'application/json' } });
        }
      }
    } catch {}
    return new Response(JSON.stringify({ history: [], conversation_id: loadConversationId }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  // ── SEND MESSAGE ──────────────────────────────────────────
  if (!message) {
    return new Response(JSON.stringify({ error: 'Message is required' }), {
      status: 400, headers: { 'content-type': 'application/json' },
    });
  }

  // ── OLLAMA PROXY ──────────────────────────────────────────
  if (selectedModel.type === 'ollama') {
    try {
      const ollamaRes = await fetch(ollamaTunnel + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4',
          messages: [
            { role: 'system', content: selectedModel.system },
            { role: 'user', content: message },
          ],
          stream: false,
        }),
      });
      if (!ollamaRes.ok) {
        const err = await ollamaRes.text();
        return new Response(JSON.stringify({ error: 'Ollama error', detail: err.slice(0, 200) }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const data = await ollamaRes.json();
      const reply = data && data.message && data.message.content;
      return new Response(JSON.stringify({
        reply: reply || '...',
        model: 'Ollama (gemma4)',
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Ollama unreachable', detail: e.message }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ── LOCAL COMFYUI IMAGE GENERATION ───────────────────────
  if (selectedModel.id && selectedModel.id.startsWith('comfyui-')) {
    try {
      const comfyRes = await fetch(comfyuiTunnel + '/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: message, model: selectedModel.id.replace('comfyui-', '') }),
      });
      if (!comfyRes.ok) {
        const err = await comfyRes.text();
        return new Response(JSON.stringify({ error: 'Local ComfyUI error', detail: err.slice(0, 200) }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const data = await comfyRes.json();
      const imageData = data.images && data.images[0] && data.images[0].data;

      if (sbKey) {
        const convId = conversationId || 'default';
        const record = { session_id: sessionId, role: 'user', content: message, model: selectedModel.id, conversation_id: convId };
        if (username) record.username = username;
        try {
          await sbFetch('/rest/v1/ai_conversations', { method: 'POST', body: JSON.stringify([record]) }, sbKey);
          const replyRecord = { session_id: sessionId, role: 'assistant', content: '[image]', model: selectedModel.name + ' (local)', conversation_id: convId };
          if (username) replyRecord.username = username;
          await sbFetch('/rest/v1/ai_conversations', { method: 'POST', body: JSON.stringify([replyRecord]) }, sbKey);
        } catch {}
      }

      return new Response(JSON.stringify({
        image: imageData || null,
        model: selectedModel.name + ' (local)',
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'ComfyUI unreachable', detail: e.message }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ── CF IMAGE GENERATION ───────────────────────────────────
  if (selectedModel.type === 'image') {
    try {
      const imageRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + selectedModel.id, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: message }),
      });
      if (!imageRes.ok) {
        const err = await imageRes.text();
        return new Response(JSON.stringify({ error: 'Image generation failed', status: imageRes.status, detail: err.slice(0, 200) }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const buffer = await imageRes.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
      }
      const dataUrl = 'data:image/png;base64,' + btoa(binary);

      if (sbKey) {
        const convId = conversationId || 'default';
        const record = { session_id: sessionId, role: 'user', content: message, model: selectedModel.id, conversation_id: convId };
        if (username) record.username = username;
        try {
          await sbFetch('/rest/v1/ai_conversations', { method: 'POST', body: JSON.stringify([record]) }, sbKey);
          const replyRecord = { session_id: sessionId, role: 'assistant', content: '[image]', model: selectedModel.id + ' (image)', conversation_id: convId };
          if (username) replyRecord.username = username;
          await sbFetch('/rest/v1/ai_conversations', { method: 'POST', body: JSON.stringify([replyRecord]) }, sbKey);
        } catch {}
      }

      return new Response(JSON.stringify({
        image: dataUrl,
        model: selectedModel.name,
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Image request failed', detail: e.message }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ── TEXT MODELS ───────────────────────────────────────────
  // Load history
  let history = [];
  let memoryEnabled = false;
  if (sbKey) {
    try {
      const lookupCol = username ? 'username' : 'session_id';
      const lookupVal = username || sessionId;
      const histRes = await sbFetch(
        '/rest/v1/ai_conversations?' + lookupCol + '=eq.' + encodeURIComponent(lookupVal) + '&conversation_id=eq.' + encodeURIComponent(conversationId || 'default') + '&order=created_at.asc&limit=20',
        { method: 'GET' }, sbKey
      );
      if (histRes.status === 200) {
        const rows = JSON.parse(histRes.body);
        if (Array.isArray(rows)) {
          history = rows.filter(r => r.content !== '[image]').map(r => ({ role: r.role, content: r.content }));
          memoryEnabled = true;
        }
      }
    } catch {}
  }

  const messages = [
    { role: 'system', content: selectedModel.system || '' },
    ...history,
    { role: 'user', content: message },
  ];

  let reply = '';
  try {
    const aiRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + selectedModel.id, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(JSON.stringify({ error: 'AI service error', status: aiRes.status, detail: errText.slice(0, 300) }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
    const data = await aiRes.json();
    reply = data && data.result && data.result.response;
    if (!reply) reply = '...';
  } catch (e) {
    return new Response(JSON.stringify({ error: 'AI request failed', detail: e.message }), {
      status: 502, headers: { 'content-type': 'application/json' },
    });
  }

  if (sbKey) {
    const convId = conversationId || 'default';
    try {
      const userRec = { session_id: sessionId, role: 'user', content: message, model: selectedModel.id, conversation_id: convId };
      if (username) userRec.username = username;
      await sbFetch('/rest/v1/ai_conversations', { method: 'POST', body: JSON.stringify([userRec]) }, sbKey);
      const aiRec = { session_id: sessionId, role: 'assistant', content: reply, model: selectedModel.id, conversation_id: convId };
      if (username) aiRec.username = username;
      await sbFetch('/rest/v1/ai_conversations', { method: 'POST', body: JSON.stringify([aiRec]) }, sbKey);
    } catch {}
  }

  return new Response(JSON.stringify({
    reply, memory: memoryEnabled,
    history_count: Math.floor(history.length / 2),
    model: selectedModel.name,
    conversation_id: conversationId || 'default',
    username,
  }), { headers: { 'content-type': 'application/json' } });
}
