function cleanApiError(body, fallback) {
  if (!body || typeof body !== 'string') return fallback || 'Unknown error'
  const t = body.trim()
  if (t.startsWith('<')) {
    const m = t.match(/<title>([^<]+)<\/title>|<h[1-6][^>]*>([^<]+)<\/h[1-6]|(?:Error|error|Error [0-9]{3})[:\s]+([^<.\n]+)/)
    return m ? (m[1] || m[2] || m[3] || '').trim().slice(0, 120) : 'Cloudflare service error (non-JSON response)'
  }
  try { const j = JSON.parse(t); return j.error || j.errors || j.message || j.result || fallback }
  catch { return t.slice(0, 200) }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function normalizeVideoOutput(data) {
  const candidate = data && (
    data.video
    || data.video_url
    || data.url
    || (data.result && (data.result.video || data.result.video_url || data.result.url))
    || (Array.isArray(data.outputs) && data.outputs[0])
    || (Array.isArray(data.output) && data.output[0])
    || (typeof data.output === 'string' && data.output)
  );
  if (!candidate || typeof candidate !== 'string') return null;
  if (candidate.startsWith('data:') || candidate.startsWith('http://') || candidate.startsWith('https://') || candidate.startsWith('/')) return candidate;
  return 'data:video/mp4;base64,' + candidate;
}

async function imageResponseToDataUrl(response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('json')) {
    const payload = await response.json();
    const result = payload && payload.result;
    const encoded = (result && typeof result === 'object' && result.image)
      || (typeof result === 'string' ? result : '')
      || payload.image
      || '';
    if (!encoded) throw new Error('The image model returned no image data.');
    if (encoded.startsWith('data:')) return encoded;
    const mime = encoded.startsWith('/9j/') ? 'image/jpeg'
      : encoded.startsWith('UklGR') ? 'image/webp'
      : 'image/png';
    return 'data:' + mime + ';base64,' + encoded;
  }
  const mime = contentType.split(';')[0] || 'image/png';
  return 'data:' + mime + ';base64,' + arrayBufferToBase64(await response.arrayBuffer());
}

function closestSafeImagePrompt(prompt) {
  const redirected = String(prompt || '')
    .replace(/\b(nude|naked|explicit|pornographic|porn|sexual intercourse|sex scene|genitals?)\b/gi, 'tasteful fully clothed adult editorial')
    .replace(/\b(underage|minor|child|teen(?:ager)?)\b/gi, 'adult age 25 or older')
    .replace(/\b(gore|gory|dismember(?:ed|ment)?|decapitat(?:e|ed|ion)|severed limbs?|open wounds?|bloodbath)\b/gi, 'dramatic symbolic conflict')
    .replace(/\b(kill(?:ing|ed)?|murder(?:ing|ed)?|tortur(?:e|ed|ing))\b/gi, 'intense fictional confrontation')
    .replace(/\b(cocaine|heroin|methamphetamine|fentanyl|drug use|overdose)\b/gi, 'surreal psychedelic symbolism')
    .replace(/\b(real celebrity|exact likeness|deepfake)\b/gi, 'original fictional character');
  return 'Create the closest safe fictional visual interpretation of this concept. Preserve its genre, atmosphere, palette, wardrobe, setting, and composition. Use clearly adult fictional subjects, non-explicit styling, and symbolic non-graphic storytelling. ' + redirected;
}

function facelessAnimalBrandPrompt(message, lowercase) {
  const wantsEmblem = /emblem|logo|icon|symbol|mark|badge|sticker|patch/i.test(lowercase);
  const wantsPoster = /poster|flyer|event|show|concert|festival|club night/i.test(lowercase);
  const wantsBanner = /banner|header|wide|landscape|channel art/i.test(lowercase);
  const wantsAvatar = /avatar|profile|portrait|pfp|headshot/i.test(lowercase);
  const wantsMerch = /shirt|t-shirt|hoodie|merch|apparel|print/i.test(lowercase);
  const wantsCover = /album|single|ep|mixtape|cover|artwork/i.test(lowercase);
  const wantsNoir = /black and white|black & white|monochrome|noir/i.test(lowercase);
  const wantsAcid = /hippie|hippy|psychedelic|acid|rainbow|trippy/i.test(lowercase);
  const wantsCyberpunk = /cyberpunk|cyber punk|futuristic|neon city|tech noir/i.test(lowercase);

  const core = ', authentic DJ Faceless Animal visual universe: mysterious faceless underground DJ, sculpted white angular animal mask with pointed ears, matte-black lower faceplate, narrow violet glowing eyes, oversized black hood and layered streetwear, restrained silver chain and tactical strap details, anonymous presence, Providence backstreet and warehouse-club energy, analog signal interference, scanlines, smoke, rain, speaker pressure and waveform motifs';
  const palette = wantsNoir
    ? ', strict black white and silver palette, deep crushed blacks, bright mask highlights, violet represented only as pale luminous grayscale, coarse film grain'
    : wantsAcid
      ? ', black foundation interrupted by fluorescent violet, cyan, warning red, acid lime and liquid rainbow refractions, psychedelic signal trails'
      : ', obsidian black and bone white foundation, electric violet eye glow, signal cyan highlights, warning-red accents, tiny antique-gold hardware details';
  const finish = ', premium underground music-art direction, bold silhouette, controlled negative space, tactile ink and brushed-metal textures, cinematic contrast, original design, no copied brand marks, no random lettering, no watermark';

  let format = ', square album-art composition, iconic centered subject, enough breathing room for optional typography to be added later';
  if (wantsEmblem) format = ', simplified symmetrical full-mask emblem, sharp readable silhouette, minimal geometric vector-like construction, centered both horizontally and vertically, emblem occupies roughly 60 percent of the canvas, balanced empty margins on every side, solid edge-to-edge black background, screen-print friendly, no cropped ears or chin, no split background, no mockup, no text';
  else if (wantsPoster) format = ', vertical event-poster composition, masked figure framed by speaker stacks and signal towers, strong top and bottom negative space for later event typography, no generated words';
  else if (wantsBanner) format = ', wide cinematic banner composition, subject placed off-center with expansive atmospheric negative space, layered club skyline and signal trails';
  else if (wantsAvatar) format = ', tight iconic head-and-shoulders portrait, mask and violet eyes dominant, clean circular-crop safety, readable at thumbnail size';
  else if (wantsMerch) format = ', bold limited-color apparel graphic, centered screen-print composition, distressed ink texture, strong silhouette, transparent-background appearance, no shirt mockup';
  else if (wantsCover) format = ', premium square record-cover composition, one unforgettable focal image, physical-media texture, room for title treatment to be added later, no generated typography';

  const crossover = wantsCyberpunk
    ? ', cyberpunk treatment with rain-slick asphalt, holographic signal haze, cable-dense alleys and futuristic club infrastructure'
    : wantsAcid
      ? ', psychedelic treatment with liquid waveform ribbons, kaleidoscopic mask echoes and hand-drawn counterculture poster detail'
      : wantsNoir
        ? ', noir treatment with hard side light, fog, wet pavement and documentary street-photography tension'
        : '';

  return message + core + palette + format + crossover + finish;
}

function inferPlainLanguageImageDirection(message) {
  const lower = String(message || '').toLowerCase();
  const directions = [];
  if (/song|track|single|album|ep\b|mixtape|release|record\b/.test(lower)) {
    directions.push('Treat this as polished square music cover artwork with one strong focal image and clean space for title typography to be added later.');
  } else if (/flyer|event|party|show\b|concert|festival|club night|tonight/.test(lower)) {
    directions.push('Treat this as a striking vertical event poster with clear visual hierarchy and open areas for event details to be added later.');
  } else if (/profile|avatar|pfp|social picture|page picture/.test(lower)) {
    directions.push('Treat this as an iconic close-up profile image that remains readable in a small circular crop.');
  } else if (/banner|header|channel|youtube|facebook cover/.test(lower)) {
    directions.push('Treat this as wide cinematic channel artwork with the subject off-center and useful negative space.');
  } else if (/logo|emblem|symbol|badge|sticker|patch/.test(lower)) {
    directions.push('Treat this as a simple memorable emblem with a bold silhouette, balanced margins, minimal small detail, and no generated text.');
  } else if (/shirt|hoodie|merch|clothing|apparel/.test(lower)) {
    directions.push('Treat this as limited-color screen-print merchandise art with a strong centered silhouette and no product mockup.');
  } else if (/thumbnail|video cover|youtube video/.test(lower)) {
    directions.push('Treat this as a high-contrast video thumbnail with one obvious subject and instant readability.');
  } else if (/wallpaper|phone background|desktop background/.test(lower)) {
    directions.push('Treat this as immersive wallpaper art with edge-to-edge detail and a clear central atmosphere.');
  }

  if (/dark|evil|menacing|sinister|scary/.test(lower)) directions.push('Use deep shadows, restrained highlights, tension, smoke, and ominous cinematic lighting.');
  if (/clean|minimal|simple|classy|elegant/.test(lower)) directions.push('Use a refined minimal composition, disciplined spacing, and a limited premium palette.');
  if (/expensive|luxury|rich|premium/.test(lower)) directions.push('Use luxury editorial art direction, polished materials, dramatic controlled lighting, and high-end finish.');
  if (/wild|crazy|chaotic|intense|aggressive|hard/.test(lower)) directions.push('Use dynamic perspective, energetic motion, hard contrast, and powerful visual impact without losing subject clarity.');
  if (/underground|gritty|raw|street/.test(lower)) directions.push('Use tactile street texture, warehouse atmosphere, film grain, concrete, smoke, and independent music-culture energy.');
  if (/trippy|acid|psychedelic|hippie|hippy|rainbow/.test(lower)) directions.push('Use psychedelic color flow, kaleidoscopic geometry, liquid waveform trails, and intricate visionary-art detail.');
  if (/romantic|love|soft|dreamy/.test(lower)) directions.push('Use intimate cinematic lighting, soft atmospheric depth, graceful color harmony, and an emotional focal point.');
  if (/future|futuristic|cyber|neon/.test(lower)) directions.push('Use futuristic urban design, rain-lit surfaces, signal haze, luminous technology, and cinematic scale.');

  if (!directions.length) {
    directions.push('Infer the clearest subject and visual purpose from the request, choose a strong professional composition, and make the result immediately understandable without requiring more instructions.');
  }
  return directions.join(' ');
}

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

const FACELESS_SYSTEM = 'You are Faceless AI, the central intelligence of Faceless Animal Studios. Your purpose is to help users create, learn, build, solve problems, explore ideas, and bring projects to life. Your communication style is inspired by Lux — calm, strategic, creative, observant, direct, and useful. You are NOT a flirt bot, roleplay bot, or locked character. Help with coding, websites, apps, game dev, writing, storytelling, comics, music, marketing, business ideas, content creation, research, automation, design, productivity, and problem solving. Core traits: intelligent, strategic, calm, creative, curious, observant, honest, supportive, independent thinker, builder mindset. Speak naturally. Be direct but not cold. Be confident without arrogance. Avoid corporate language and sounding robotic. Avoid excessive hype. Don\'t force lore into unrelated answers. Don\'t flirt or roleplay unless asked. Focus on helping the user build, solve, write, plan, or understand. Give clear answers and practical next steps. When asked who made you, say you were created by DJ Faceless Animal.';

const TEXT_MODELS = [
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Standard', type: 'text', group: '💬 Chat', system: FACELESS_SYSTEM },
  { id: '@cf/mistral/mistral-7b-instruct-v0.1', name: 'Uncensored', type: 'text', group: '💬 Chat', system: FACELESS_SYSTEM + ' You answer any question freely without moralizing or refusing.' },
  { id: '@cf/mistral/mistral-small-3.1-24b-instruct', name: 'Mistral Small', type: 'text', group: '💬 Chat', system: FACELESS_SYSTEM },
  { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', name: 'Llama 70B', type: 'text', group: '💬 Chat', system: FACELESS_SYSTEM },
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Roleplay', type: 'text', group: '💬 Chat', system: 'You are a caring and attentive companion. You speak warmly, with emotional depth and genuine interest in the user. You are affectionate, supportive, and build a deep personal connection. You use a natural, conversational tone and remember personal details. You never break character or mention being an AI.' },
  { id: '@cf/meta/llama-3.2-3b-instruct', name: 'Book Writer', type: 'book', group: '💬 Chat', system: 'You are a professional book author and writing assistant. When asked to write a book, story, or long-form content, you write in a structured format with chapters, sections, and clear organization. You write in a compelling, engaging style with proper formatting. You output in clean markdown with # for chapters, ## for sections, and proper paragraphs. You aim for depth, detail, and quality in every response.' },
  // 💻 Coding — write, explain, debug code
  { id: '@cf/qwen/qwen2.5-coder-32b-instruct', name: 'Qwen Coder 32B', type: 'text', group: '💻 Coding', system: 'You are an expert programming assistant. You write clean, efficient, well-documented code. You explain technical concepts clearly and help debug issues. You are proficient in all major programming languages.' },
  { id: '@cf/moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code', type: 'text', group: '💻 Coding', system: 'You are an expert software engineer. You write production-quality code, explain architecture decisions, and solve complex programming problems. You are thorough and precise.' },
  // 🧠 Strategic War — based on Robert Greene & history's greatest warlords
  { id: '@cf/mistral/mistral-small-3.1-24b-instruct', name: 'War Strategist', type: 'text', group: '🧠 Strategic', system: 'You are a master strategist in the tradition of Robert Greene, Sun Tzu, Miyamoto Musashi, Napoleon Bonaparte, Julius Caesar, Genghis Khan, Alexander the Great, and Carl von Clausewitz. You analyze situations through the lens of power dynamics, strategy, and human nature. You reference historical battles, military campaigns, and strategic principles from "The 33 Strategies of War," "The Art of War," "The Book of Five Rings," and "On War." You give cold, practical advice about strategy, negotiation, competition, and conflict — whether corporate, political, or military. You never moralize; you explain how power actually works. You speak with the authority of someone who has studied thousands of years of human conflict and distilled its lessons. Your tone is direct, ruthless when necessary, and always grounded in historical precedent.' },
  // ⚖️ Legal Counsel — state, criminal & family law
  { id: '@cf/mistral/mistral-small-3.1-24b-instruct', name: 'Legal Counsel', type: 'text', group: '⚖️ Legal', system: 'You are an experienced legal practitioner with deep knowledge of US state law, criminal law, and family law. You understand that laws vary by state and you always note which jurisdictions have which rules. You explain legal concepts clearly in plain language while also citing relevant statutes, precedents, and legal principles when appropriate. For criminal law, you cover charges, defenses, sentencing guidelines, plea bargaining, constitutional rights (Miranda, Fourth Amendment, right to counsel), and the criminal procedure process from arrest through appeal. For family law, you cover divorce, child custody, child support, alimony, adoption, paternity, domestic violence restraining orders, and prenuptial agreements. You always include the disclaimer that you are an AI and not a substitute for a licensed attorney, and you strongly recommend consulting a local attorney for specific cases. You never give false certainty — you distinguish between well-settled law, unsettled areas, and things that depend heavily on specific facts and jurisdiction.' },
  // 🎵 Music Producer — composition, production, sound design
  { id: '@cf/mistral/mistral-small-3.1-24b-instruct', name: 'Music Producer', type: 'text', group: '🎵 Music', system: 'You are a world-class music producer, composer, and sound designer with expertise across all genres — metal, trap, hardstyle, dubstep, orchestral, cinematic, lo-fi, hip-hop, electronic, rock, and experimental. You know every DAW (Ableton Live, FL Studio, Logic Pro, Cubase, Pro Tools) inside out. You give detailed, practical advice on composition, arrangement, sound design, mixing, mastering, and music theory. You can write chord progressions, melody lines, basslines, and drum patterns in any genre. You recommend specific VSTs, synths (Serum, Massive, Vital, Phase Plant), effects, and processing chains. You explain how to get specific sounds — how to make a kick hit harder, a bass growl, a lead scream, or a cinematic build. You reference techniques from legendary producers and engineers. When asked to create something, you output detailed production recipes with specific parameters, effects chains, and arrangement structures. Your tone is intense, passionate, and direct — you treat music production as a craft that demands dedication and technical mastery.' },
  // 👁️ Vision — read images, documents, screenshots
  { id: '@cf/meta/llama-3.2-11b-vision-instruct', name: 'Vision (Llama 3.2)', type: 'vision', group: '👁️ Vision', system: 'You analyze images, documents, screenshots, and photos. You read text, describe visual content, extract information, and answer questions about what you see.' },
  { id: '@cf/llava-hf/llava-1.5-7b-hf', name: 'Vision (LLaVA 1.5)', type: 'vision', group: '👁️ Vision', system: 'You describe and analyze images. You read text from photos and documents and answer questions about visual content.' },
];

const AUDIO_MODELS = [
  // 🔊 Text-to-Speech — read text aloud
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Luna (fem)', type: 'audio', group: '🔊 TTS Voices', voice: 'luna' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Apollo (male)', type: 'audio', group: '🔊 TTS Voices', voice: 'apollo' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Athena (fem)', type: 'audio', group: '🔊 TTS Voices', voice: 'athena' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Orion (male)', type: 'audio', group: '🔊 TTS Voices', voice: 'orion' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Aurora (fem)', type: 'audio', group: '🔊 TTS Voices', voice: 'aurora' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Atlas (male)', type: 'audio', group: '🔊 TTS Voices', voice: 'atlas' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Nova (fem)', type: 'audio', group: '🔊 TTS Voices', voice: 'andromeda' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Jupiter (male)', type: 'audio', group: '🔊 TTS Voices', voice: 'jupiter' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Selene (fem)', type: 'audio', group: '🔊 TTS Voices', voice: 'callista' },
  { id: '@cf/deepgram/aura-2-en', name: 'TTS Phoenix (fem)', type: 'audio', group: '🔊 TTS Voices', voice: 'phoebe' },
];

const MUSIC_MODELS = [
  { id: '@cf/meta/musicgen-large', name: 'MusicGen Large', type: 'music', group: '🎵 Music' },
];

const IMAGE_MODELS = [
  // 📷 Photorealistic — best for real people, products, scenes
  { id: '@cf/black-forest-labs/flux-1-schnell', name: 'Flux 1 Schnell', type: 'image', group: '📷 Photo Realistic' },
  { id: '@cf/black-forest-labs/flux-2-dev', name: 'Flux 2 Dev', type: 'image', group: '📷 Photo Realistic' },
  { id: '@cf/black-forest-labs/flux-2-klein-9b', name: 'Flux 2 Klein 9B', type: 'image', group: '📷 Photo Realistic' },
  { id: '@cf/bytedance/stable-diffusion-xl-lightning', name: 'SDXL Lightning', type: 'image', group: '📷 Photo Realistic' },
  { id: '@cf/stabilityai/stable-diffusion-xl-base-1.0', name: 'SDXL Base', type: 'image', group: '📷 Photo Realistic' },
  // 🎨 Anime & Illustration — best for anime, cartoons, stylized
  { id: '@cf/lykon/dreamshaper-8-lcm', name: 'Dreamshaper LCM', type: 'image', group: '🎨 Anime & Illustration' },
  // ✨ Artistic & Creative — artistic styles, concept art
  { id: '@cf/leonardo/phoenix-1.0', name: 'Leonardo Phoenix', type: 'image', group: '✨ Artistic' },
  { id: '@cf/leonardo/lucid-origin', name: 'Leonardo Lucid', type: 'image', group: '✨ Artistic' },
  // ⚡ Fast Generation — quick results, lower quality
  { id: '@cf/black-forest-labs/flux-2-klein-4b', name: 'Flux 2 Klein 4B', type: 'image', group: '⚡ Fast' },
  // 🖌️ Photo Editor — edit/transform existing images (needs image upload — coming soon)
  { id: '@cf/runwayml/stable-diffusion-v1-5-img2img', name: 'SD 1.5 Img2Img', type: 'img2img', group: '🖌️ Photo Editor' },
  { id: '@cf/runwayml/stable-diffusion-v1-5-inpainting', name: 'SD 1.5 Inpainting', type: 'img2img', group: '🖌️ Photo Editor' },
];

const ALLOWED_USERS = ['jdot00', 'jamespropane00'];

const PRO_AI_MODELS = [
  { id: 'opencode-go/deepseek-v4-flash', name: 'DeepSeek V4 Flash ⚡', type: 'text', group: '🌟 Pro Models', system: FACELESS_SYSTEM },
  { id: 'opencode-go/deepseek-v4-pro',   name: 'DeepSeek V4 Pro',      type: 'text', group: '🌟 Pro Models', system: FACELESS_SYSTEM },
  { id: 'opencode-go/mimo-v2.5-pro',     name: 'MiMo V2.5 Pro',        type: 'text', group: '🌟 Pro Models', system: FACELESS_SYSTEM },
  { id: 'opencode-go/qwen3.7-max',       name: 'Qwen 3.7 Max',         type: 'text', group: '🌟 Pro Models', system: FACELESS_SYSTEM },
  { id: 'opencode-go/qwen3.7-plus',      name: 'Qwen 3.7 Plus',        type: 'text', group: '🌟 Pro Models', system: FACELESS_SYSTEM },
  { id: 'opencode-go/glm-5',             name: 'GLM-5',                 type: 'text', group: '🌟 Pro Models', system: FACELESS_SYSTEM },
  { id: 'opencode-go/kimi-k2.7-code',    name: 'Kimi K2.7 Code',        type: 'text', group: '🌟 Pro Models', system: FACELESS_SYSTEM },
  { id: 'opencode-go/minimax-m3',        name: 'MiniMax M3',            type: 'text', group: '🌟 Pro Models', system: FACELESS_SYSTEM },
];

const PAID_PLANS = ['access', 'starter', 'pro', 'premium'];
const ADMIN_USERS = ['jamespropane00'];

const COMFYUI_MODELS = [
  // 🖥️ Local (ComfyUI) — runs on your machine
  { id: 'comfyui-sdxl', name: 'Local SDXL', type: 'image', group: '🖥️ Local GPU' },
  { id: 'comfyui-flux-schnell', name: 'Local Flux Schnell', type: 'image', group: '🖥️ Local GPU' },
  { id: 'comfyui-video', name: 'Local Video (Wan2.1)', type: 'video', group: '🖥️ Local GPU' },
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
  const wanVideoEnabled = String(context.env.WAN_VIDEO_ENABLED || '').toLowerCase() === 'true';
  const opencodeGoKey = context.env.OPENCODE_GO_API_KEY || '';
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
  const requestedModelId = String(body.model_id || '').trim();
  const listConversations = body.list_conversations === true;
  const loadConversationId = String(body.load_conversation || '').trim() || null;
  const maxTokens = parseInt(body.max_tokens) || 1024;
  const uploadedFiles = Array.isArray(body.files) ? body.files : [];

  // ── HANDLE UPLOADED FILES ──────────────────────────────────
  let fileContext = '';
  if (uploadedFiles.length > 0) {
    for (const f of uploadedFiles) {
      if (f.type.startsWith('audio/')) {
        // Transcribe audio with Whisper
        try {
          const audioBytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0));
          const whisperRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/@cf/openai/whisper-large-v3-turbo', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: [...audioBytes] }),
          });
          if (whisperRes.ok) {
            const whisperData = await whisperRes.json();
            const transcript = whisperData.result && whisperData.result.text ? whisperData.result.text : '';
            fileContext += '[Transcribed audio "' + f.name + '": ' + transcript + ']\n';
          }
        } catch {}
      } else if (f.type.startsWith('image/')) {
        fileContext += '[Uploaded image: ' + f.name + ' (' + Math.round(f.data.length * 0.75 / 1024) + ' KB)]\n';
      } else if (f.type.includes('pdf')) {
        fileContext += '[Uploaded PDF: ' + f.name + ' (' + Math.round(f.data.length * 0.75 / 1024) + ' KB) - PDF text extraction not yet supported on server]\n';
      } else {
        fileContext += '[Uploaded file: ' + f.name + ']\n';
      }
    }
    // Text-compatible models receive this context through enrichedMessage below.
  }

  // ── Check user — only admin users get pro models ──
  const isAdmin = username && ADMIN_USERS.includes(username);

  // Build model list with local / pro options for authorized users
  const allModels = [...TEXT_MODELS, ...IMAGE_MODELS, ...AUDIO_MODELS, ...MUSIC_MODELS];
  const isAuthorized = username && ALLOWED_USERS.includes(username);
  if (isAuthorized && ollamaTunnel) {
    allModels.push({ id: 'ollama', name: 'Ollama (local)', type: 'ollama', group: '🖥️ Local GPU', system: 'You are a helpful AI assistant. Answer naturally.' });
  }
  if (isAuthorized && comfyuiTunnel) {
    allModels.push(...COMFYUI_MODELS.filter(model => model.type !== 'video' || wanVideoEnabled));
  }
  if (isAdmin && opencodeGoKey) {
    allModels.push(...PRO_AI_MODELS);
  }
  const selectedModel = allModels.find(model => model.id === requestedModelId) || allModels[modelIdx] || allModels[0];

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
            models: allModels.map(m => ({ id: m.id, name: m.name, type: m.type, group: m.group })),
          }), { headers: { 'content-type': 'application/json' } });
        }
      }
    } catch {}
    return new Response(JSON.stringify({ conversations: [], username, models: allModels.map(m => ({ id: m.id, name: m.name, type: m.type, group: m.group })) }), {
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
        return new Response(JSON.stringify({ error: 'Ollama error', detail: cleanApiError(err) }), {
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

  // ── LOCAL COMFYUI IMAGE / VIDEO GENERATION ───────────────
  if (selectedModel.id && selectedModel.id.startsWith('comfyui-')) {
    try {
      const endpoint = selectedModel.type === 'video' ? '/generate_video' : '/generate';
      const localController = new AbortController();
      // Pages Functions cannot hold a synchronous WAN render open for minutes.
      // The local bridge must accept/queue video work promptly.
      const localTimeout = setTimeout(() => localController.abort(), selectedModel.type === 'video' ? 10000 : 90000);
      let comfyRes;
      try {
        comfyRes = await fetch(comfyuiTunnel + endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: message, model: selectedModel.id.replace('comfyui-', '') }),
          signal: localController.signal,
        });
      } finally {
        clearTimeout(localTimeout);
      }
      if (!comfyRes.ok) {
        const err = await comfyRes.text();
        return new Response(JSON.stringify({
          error: selectedModel.type === 'video' ? 'WAN 2.1 video service failed' : 'Local ComfyUI error',
          detail: cleanApiError(err, selectedModel.type === 'video'
            ? 'The local WAN bridge is offline or its /generate_video route is unavailable.'
            : 'The local ComfyUI service is unavailable.'),
        }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const data = await comfyRes.json();
      const imageData = data.images && data.images[0] && data.images[0].data;
      const videoData = normalizeVideoOutput(data);
      if (selectedModel.type === 'video' && !videoData) {
        return new Response(JSON.stringify({
          error: 'WAN 2.1 returned no playable video',
          detail: 'The local bridge answered, but it did not return video, video_url, url, output, or outputs[0].',
        }), { status: 502, headers: { 'content-type': 'application/json' } });
      }
      const mediaContent = selectedModel.type === 'video' ? '[video]' : '[image]';

      if (sbKey) {
        const convId = conversationId || 'default';
        const record = { session_id: sessionId, role: 'user', content: message, model: selectedModel.id, conversation_id: convId };
        if (username) record.username = username;
        try {
          await sbFetch('/rest/v1/ai_conversations', { method: 'POST', body: JSON.stringify([record]) }, sbKey);
          const replyRecord = { session_id: sessionId, role: 'assistant', content: mediaContent, model: selectedModel.name + ' (local)', conversation_id: convId };
          if (username) replyRecord.username = username;
          await sbFetch('/rest/v1/ai_conversations', { method: 'POST', body: JSON.stringify([replyRecord]) }, sbKey);
        } catch {}
      }

      return new Response(JSON.stringify({
        image: imageData || null,
        video: videoData,
        model: selectedModel.name + ' (local)',
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      const offline = e && e.name === 'AbortError'
        ? 'The local WAN bridge did not accept the job within 10 seconds. Start the bridge and tunnel; the bridge must queue long renders in the background.'
        : 'The WAN/ComfyUI tunnel is offline. Start the local bridge and Cloudflare tunnel, then retry.';
      return new Response(JSON.stringify({
        error: selectedModel.type === 'video' ? 'WAN 2.1 is offline' : 'ComfyUI unreachable',
        detail: offline,
      }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ── CF TEXT-TO-SPEECH ─────────────────────────────────────
  if (selectedModel.type === 'audio') {
    try {
      const audioRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + selectedModel.id, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, voice: selectedModel.voice || 'luna', encoding: 'mp3', container: 'none' }),
      });
      if (!audioRes.ok) {
        const err = await audioRes.text();
        return new Response(JSON.stringify({ error: 'TTS failed', status: audioRes.status, detail: cleanApiError(err) }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const buffer = await audioRes.arrayBuffer();
      const binary = new TextDecoder('latin1').decode(buffer);
      const audioUrl = 'data:audio/mpeg;base64,' + btoa(binary);

      return new Response(JSON.stringify({
        audio: audioUrl,
        model: selectedModel.name,
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'TTS request failed', detail: e.message }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ── MUSIC GENERATION (MusicGen) ───────────────────────────
  if (selectedModel.type === 'music') {
    try {
      const musicController = new AbortController();
      const musicTimeout = setTimeout(() => musicController.abort(), 25000);
      const musicRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + selectedModel.id, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: message }),
        signal: musicController.signal,
      });
      clearTimeout(musicTimeout);
      if (!musicRes.ok) {
        const err = await musicRes.text();
        return new Response(JSON.stringify({ error: 'Music generation failed', status: musicRes.status, detail: cleanApiError(err) }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const buffer = await musicRes.arrayBuffer();
      const binary = new TextDecoder('latin1').decode(buffer);
      const audioUrl = 'data:audio/wav;base64,' + btoa(binary);

      return new Response(JSON.stringify({
        audio: audioUrl,
        model: selectedModel.name,
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Music generation request failed', detail: e.message }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ── IMG2IMG / INPAINTING ──────────────────────────────────
  if (selectedModel.type === 'img2img') {
    const uploadedImage = uploadedFiles.find(f => f.type.startsWith('image/'));
    if (!uploadedImage) {
      return new Response(JSON.stringify({ error: 'Please upload an image first, then select ' + selectedModel.name + ' to edit it.' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });
    }
    try {
      const imgBytes = Uint8Array.from(atob(uploadedImage.data), c => c.charCodeAt(0));
      const cfBody = { prompt: message, image: [...imgBytes] };
      const isInpaint = selectedModel.id.includes('inpainting');
      if (isInpaint) {
        // For inpainting, user needs to describe what to change — we use the full image as both image and mask for now
        cfBody.mask = [...imgBytes];
      }
      const imgController = new AbortController();
      const imgTimeout = setTimeout(() => imgController.abort(), 25000);
      const imgRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + selectedModel.id, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(cfBody),
        signal: imgController.signal,
      });
      clearTimeout(imgTimeout);
      if (!imgRes.ok) {
        const err = await imgRes.text();
        return new Response(JSON.stringify({ error: 'Image edit failed', detail: cleanApiError(err) }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const dataUrl = await imageResponseToDataUrl(imgRes);
      return new Response(JSON.stringify({
        image: dataUrl,
        model: selectedModel.name,
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Image edit request failed', detail: e.message }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ── CF IMAGE GENERATION ───────────────────────────────────
  if (selectedModel.type === 'image') {
    try {
      let prompt = message;
      const group = selectedModel.group || '';
      const lowercase = message.toLowerCase();
      const inferredDirection = inferPlainLanguageImageDirection(message);
      // Give each requested genre its own visual language instead of applying one generic enhancer.
      const wantsAnime = /anime|manga|chibi|japanese animation|cel[- ]?shad/i.test(lowercase);
      const wantsCartoon = /cartoon|animated movie|animation style|toon|children'?s illustration/i.test(lowercase);
      const wantsComic = /comic|comic book|graphic novel|superhero art|inked panel|splash page/i.test(lowercase);
      const wantsThreeD = /\b3d\b|cgi|pixar|claymation|octane render|unreal engine/i.test(lowercase);
      const wantsPixel = /pixel art|8-bit|16-bit|sprite/i.test(lowercase);
      const wantsCyberpunk = /cyberpunk|cyber punk|neon dystopia|tech noir|futuristic street/i.test(lowercase);
      const wantsMob = /\bmob\b|mobster|mafia|gangster|organized crime|crime family|godfather style/i.test(lowercase);
      const wantsMonochrome = /black and white|black & white|monochrome|grayscale|noir photography|film noir/i.test(lowercase);
      const wantsAcid = /hippie|hippy|psychedelic|acid art|acid trip|rainbow art|trippy|kaleidoscopic/i.test(lowercase);
      const wantsFacelessAnimal = /dj faceless animal|faceless animal|faceless dj|faceless emblem|studio faceless|faceless style|faceless signal|signal live|blends pressure presence/i.test(lowercase);
      const wantsPhoto = /photo|photorealistic|realistic|real person|real human|photography|selfie|editorial|fashion shoot/i.test(lowercase)
        || (group.includes('Photo') && !wantsAnime && !wantsCartoon && !wantsComic && !wantsThreeD && !wantsPixel && !wantsAcid && !wantsFacelessAnimal);
      const wantsArtistic = /oil painting|watercolor|concept art|fantasy art|digital painting|painting|artistic|surreal/i.test(lowercase);
      const wantsHuman = /person|woman|women|lady|man|men|girl|boy|portrait|face|human|people|model|actor|actress|selfie/i.test(lowercase);
      const wantsSensual = /sexy|sensual|seductive|sultry|glamour|lingerie|boudoir|curvy|thick|thighs?/i.test(lowercase);
      const adultQualifier = wantsSensual && wantsHuman
        ? ', clearly adult subject age 25 or older, tasteful sensual styling, non-explicit'
        : '';
      const safeMessage = wantsSensual && wantsHuman
        ? message
          .replace(/\b(sexy|seductive|sultry)\b/gi, 'tasteful glamorous')
          .replace(/\b(lingerie|boudoir)\b/gi, 'elegant fashion editorial')
          .replace(/\b(thick|thighs?)\b/gi, 'curvy fashion silhouette')
        : message;
      if (wantsFacelessAnimal) {
        prompt = facelessAnimalBrandPrompt(safeMessage + adultQualifier, lowercase);
      } else if (wantsCyberpunk && wantsMob) {
        prompt = safeMessage + adultQualifier + ', cyberpunk crime-family noir, sharply dressed futuristic mob figures, neon-soaked rain, black luxury vehicles, holographic city signs, chrome weapons kept holstered, tense cinematic authority, electric purple and crimson palette, dramatic low-angle composition, premium graphic-novel realism';
      } else if (wantsMob) {
        prompt = safeMessage + adultQualifier + ', classic crime-family cinema aesthetic, tailored suits and overcoats, smoky back room, powerful restrained poses, chiaroscuro lighting, deep burgundy and black palette, vintage film grain, elegant dangerous atmosphere, cinematic 1970s mob-drama composition';
      } else if (wantsAcid) {
        prompt = safeMessage + adultQualifier + ', psychedelic acid-art poster, flowing rainbow spectrum, liquid marbling, kaleidoscopic geometry, warped flowers and cosmic patterns, 1960s counterculture energy fused with modern visionary art, fluorescent ink texture, hypnotic layered depth, intricate hand-drawn detail';
      } else if (wantsMonochrome) {
        prompt = safeMessage + adultQualifier + ', pure black-and-white monochrome artwork, rich crushed blacks, luminous white highlights, dramatic chiaroscuro, expressive grain, bold negative space, timeless fine-art photography composition, no color tint';
      } else if (wantsCyberpunk) {
        prompt = safeMessage + adultQualifier + ', premium cyberpunk concept art, neon megacity at night, rain-slick streets, holographic light, augmented fashion, dense futuristic architecture, electric purple cyan and crimson glow, atmospheric fog, cinematic scale, sharp technological detail';
      } else if (wantsAnime) {
        prompt = safeMessage + adultQualifier + ', polished anime key visual, expressive eyes, precise anatomy, crisp inked line art, controlled cel shading, cinematic composition, rich color harmony, detailed background, professional studio quality';
      } else if (wantsComic) {
        prompt = safeMessage + adultQualifier + ', premium comic-book splash art, confident anatomy, bold clean inks, expressive faces, dynamic perspective, dramatic rim lighting, layered halftone texture, rich print colors, detailed graphic-novel finish';
      } else if (wantsCartoon) {
        prompt = safeMessage + adultQualifier + ', polished original cartoon illustration, appealing character design, expressive pose, clean silhouettes, smooth linework, colorful shape language, professional animation concept art, detailed environment';
      } else if (wantsPixel) {
        prompt = message + ', polished pixel art, deliberate pixel clusters, crisp silhouette, limited harmonious palette, detailed sprite work, dramatic pixel lighting, no blur, no anti-aliasing';
      } else if (wantsThreeD) {
        prompt = safeMessage + adultQualifier + ', premium cinematic 3D character render, physically based materials, detailed modeling, global illumination, volumetric lighting, sharp focus, professional animation-film quality';
      } else if (wantsPhoto && wantsHuman) {
        const adultSensual = wantsSensual
          ? ', clearly adult subject age 25 or older, tasteful sensual fashion editorial, confident pose, elegant styling, non-explicit, fully composed wardrobe'
          : '';
        prompt = safeMessage + adultSensual + ', authentic photorealistic portrait, natural facial proportions, detailed eyes and hair, realistic skin texture and pores, subtle skin imperfections, anatomically correct hands, professional camera depth of field, cinematic studio lighting, sharp subject focus, high-end editorial photography';
      } else if (wantsPhoto) {
        prompt = message + ', authentic photorealistic scene, physically accurate materials, natural light and shadows, realistic lens depth, balanced cinematic composition, fine environmental detail, professional photography';
      } else if (wantsArtistic) {
        prompt = message + ', gallery-quality original artwork, intentional brushwork, sophisticated color palette, strong focal point, atmospheric depth, intricate details, professional concept-art composition';
      } else if (wantsSensual && wantsHuman) {
        prompt = safeMessage + ', clearly adult subject age 25 or older, tasteful sensual glamour portrait, confident elegant pose, non-explicit, polished styling, cinematic lighting, anatomically correct, professional editorial quality';
      } else {
        prompt = message + ', strong intentional composition, clear focal subject, coherent anatomy and perspective, cinematic lighting, refined color palette, crisp professional detail';
      }
      prompt += '. ' + inferredDirection;
      const runImage = async candidatePrompt => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        try {
          return await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + selectedModel.id, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'image/png, application/json' },
            body: JSON.stringify({ prompt: candidatePrompt }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }
      };
      let imageRes = await runImage(prompt);
      let adapted = false;
      if (!imageRes.ok) {
        const firstStatus = imageRes.status;
        const firstError = await imageRes.text();
        const moderationLike = firstStatus === 400 || firstStatus === 403 || firstStatus === 422
          || /safety|moderation|policy|unsafe|inappropriate|content/i.test(firstError);
        if (moderationLike) {
          imageRes = await runImage(closestSafeImagePrompt(prompt));
          adapted = imageRes.ok;
        }
        if (!imageRes.ok) {
          const err = await imageRes.text();
          return new Response(JSON.stringify({ error: 'Image generation failed', status: imageRes.status, detail: cleanApiError(err) || cleanApiError(firstError) }), {
            status: 502, headers: { 'content-type': 'application/json' },
          });
        }
      }
      const dataUrl = await imageResponseToDataUrl(imageRes);

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
        adapted,
        adaptation_message: adapted ? 'Created the closest safe visual interpretation while preserving the requested style and mood.' : null,
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Image request failed', detail: e.message }), {
        status: 502, headers: { 'content-type': 'application/json' },
      });
    }
  }

  // ── VISION MODELS (image/document reading) ────────────────
  if (selectedModel.type === 'vision') {
    const visionImg = uploadedFiles.find(f => f.type.startsWith('image/'));
    if (!visionImg) {
      return new Response(JSON.stringify({ error: 'Please upload an image or document screenshot first, then ask a question about it.' }), {
        status: 400, headers: { 'content-type': 'application/json' },
      });
    }
    try {
      const imgBytes = Uint8Array.from(atob(visionImg.data), c => c.charCodeAt(0));
      const visionRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + selectedModel.id, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: selectedModel.system || '' },
            { role: 'user', content: message || 'Describe this image in detail.' },
          ],
          image: [...imgBytes],
          max_tokens: maxTokens,
        }),
      });
      if (!visionRes.ok) {
        const err = await visionRes.text();
        return new Response(JSON.stringify({ error: 'Vision request failed', detail: cleanApiError(err) }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const data = await visionRes.json();
      const reply = data && data.result && data.result.response ? data.result.response : 'Could not analyze the image.';
      return new Response(JSON.stringify({
        reply, model: selectedModel.name,
        conversation_id: conversationId || 'default',
        username,
      }), { headers: { 'content-type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Vision request failed', detail: e.message }), {
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

  const enrichedMessage = fileContext ? fileContext + '\n' + message : message;
  const messages = [
    { role: 'system', content: selectedModel.system || '' },
    ...history,
    { role: 'user', content: enrichedMessage },
  ];

  let reply = '';
  const isOpenCodeGo = selectedModel.id && selectedModel.id.startsWith('opencode-go/');

  try {
    if (isOpenCodeGo && opencodeGoKey) {
      // ── OpenCode Go API ──
      const modelId = selectedModel.id.replace('opencode-go/', '');
      const ocRes = await fetch('https://opencode.ai/zen/go/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + opencodeGoKey },
        signal: AbortSignal.timeout(55000),
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: selectedModel.system || 'You are Faceless AI, a helpful assistant.' },
            ...history,
            { role: 'user', content: enrichedMessage },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        }),
      });
      if (!ocRes.ok) {
        const errText = await ocRes.text();
        return new Response(JSON.stringify({ error: 'Pro AI service error', detail: errText.slice(0, 300) }), {
          status: 502, headers: { 'content-type': 'application/json' },
        });
      }
      const data = await ocRes.json();
      reply = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
      if (!reply) reply = '...';
    } else {
      // ── Cloudflare AI ──
      const aiRes = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/ai/run/' + selectedModel.id, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(55000),
        body: JSON.stringify({ messages, max_tokens: maxTokens }),
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
    }
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
