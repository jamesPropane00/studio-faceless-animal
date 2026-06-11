/**
 * CREATOR DATA STORE
 * assets/js/creator-data.js
 * ════════════════════════════════════════════════════════════════════
 *
 * Central source of truth for all creator and page data on the platform.
 * Currently a static JS module. Swap for Supabase queries when ready.
 *
 * Data shape here mirrors the Supabase schema exactly so that
 * board-feed.js and page-renderer.js need zero changes when the
 * backend goes live — only this file's exports change.
 *
 * Used by:
 *   assets/js/board-feed.js    — network board rendering
 *   assets/js/page-renderer.js — template page rendering
 *
 * ── [SUPABASE CONNECT] ──────────────────────────────────────────────
 * When Supabase is connected, replace each export below with a
 * live query. The consuming files use the same exported names.
 *
 *   CREATORS  →  supabase.from('creator_profiles')
 *                  .select(`*, page_data(*)`)
 *                  .eq('status', 'live')
 *                  .order('sort_order', { ascending: true })
 *
 *   POSTS     →  supabase.from('board_posts')
 *                  .select(`*, creator_profiles(username, display_name)`)
 *                  .order('created_at', { ascending: false })
 *                  .limit(20)
 *
 *   CATEGORIES → supabase.from('creator_categories').select('*')
 *
 * Helper functions (getCreatorBySlug, getLiveCreators, etc.) can stay
 * as-is — they work on whatever array you pass them, static or fetched.
 * ════════════════════════════════════════════════════════════════════
 */


// ────────────────────────────────────────────────────────────────────
// AVATAR COLOR PRESETS
// Maps to inline CSS gradient styles used by board cards and featured
// creator blocks. Mirrors accent_color column in page_data table.
// [SUPABASE CONNECT]: pull avatar_color from creator_profiles.avatar_color
// ────────────────────────────────────────────────────────────────────
export const AVATAR_COLORS = {
  gold: {
    bg:     'linear-gradient(135deg, rgba(201,169,110,0.18), rgba(201,169,110,0.06))',
    border: 'rgba(201,169,110,0.35)',
    color:  'var(--gold)',
  },
  red: {
    bg:     'linear-gradient(135deg, rgba(200,60,60,0.18), rgba(200,60,60,0.06))',
    border: 'rgba(200,60,60,0.35)',
    color:  '#e07070',
  },
  blue: {
    bg:     'linear-gradient(135deg, rgba(40,130,200,0.18), rgba(40,130,200,0.06))',
    border: 'rgba(40,130,200,0.35)',
    color:  '#5aabdc',
  },
  purple: {
    bg:     'linear-gradient(135deg, rgba(140,60,200,0.18), rgba(140,60,200,0.06))',
    border: 'rgba(140,60,200,0.35)',
    color:  '#a06ae0',
  },
  teal: {
    bg:     'linear-gradient(135deg, rgba(40,160,130,0.18), rgba(40,160,130,0.06))',
    border: 'rgba(40,160,130,0.35)',
    color:  '#6abfa8',
  },
  neutral: {
    bg:     'rgba(255,255,255,0.03)',
    border: 'var(--border)',
    color:  'var(--text-3)',
  },
}


// ────────────────────────────────────────────────────────────────────
// CREATOR CATEGORIES
// Matches the category enum in creator_profiles table.
// Used for board card tag classes, filtering, and category pages.
// [SUPABASE CONNECT]: supabase.from('creator_categories').select('*')
// ────────────────────────────────────────────────────────────────────
export const CATEGORIES = [
  { id: 'music',    label: 'Music',         tagClass: 'creator-tag--dj',        icon: '♫',  description: 'DJs, producers, bands, vocalists, beatmakers' },
  { id: 'producer', label: 'Producer',      tagClass: 'creator-tag--producer',  icon: '◎',  description: 'Beat producers, studio engineers, sample artists' },
  { id: 'visual',   label: 'Visual Artist', tagClass: 'creator-tag--visual',    icon: '◉',  description: 'Photographers, graphic artists, illustrators' },
  { id: 'video',    label: 'Video',         tagClass: 'creator-tag--video',     icon: '▶',  description: 'Filmmakers, editors, motion designers, content creators' },
  { id: 'games',    label: 'Game Dev',      tagClass: 'creator-tag--game-dev',  icon: '◈',  description: 'Game developers, interactive media, studio-built titles' },
  { id: 'business', label: 'Business',      tagClass: 'creator-tag--business',  icon: '◻',  description: 'Local businesses, services, shops, studios' },
  { id: 'other',    label: 'Creator',       tagClass: 'creator-tag--open',      icon: '◌',  description: 'Writers, athletes, collectives, everything else' },
]


// ────────────────────────────────────────────────────────────────────
// PLAN TIER DEFINITIONS
// Matches plan enum in intake_submissions and creator_profiles tables.
// [SUPABASE CONNECT]: pull plan from creator_profiles.plan
// ────────────────────────────────────────────────────────────────────
export const PLANS = {
  free:    { label: 'Free Page',     shortLabel: 'Free Tier',   price: '$0',    tagClass: 'creator-tag--open',    pill: 'plan-pill--free'    },
  starter: { label: 'Starter Package', shortLabel: 'Starter', price: '$30',  tagClass: 'creator-tag--business', pill: 'plan-pill--starter' },
  pro:     { label: 'Pro Package',     shortLabel: 'Pro',     price: '$55',  tagClass: 'creator-tag--dj',       pill: 'plan-pill--pro'     },
  premium: { label: 'Premium Package', shortLabel: 'Premium', price: '$105', tagClass: 'creator-tag--visual',   pill: 'plan-pill--premium' },
}


// ────────────────────────────────────────────────────────────────────
// PAGE TEMPLATES
// Matches template_type column in page_data table.
// Used by page-renderer.js to choose the render function.
// ────────────────────────────────────────────────────────────────────
export const TEMPLATES = {
  creator:  { id: 'creator',  label: 'Creator Page',  file: 'templates/creator.html'  },
  business: { id: 'business', label: 'Business Page', file: 'templates/business.html' },
}


// ────────────────────────────────────────────────────────────────────
// CREATOR RECORDS
// Combines creator_profiles + page_data in a single flat object
// for easy static use. When Supabase is connected, replace this
// with a joined query: creator_profiles.select(`*, page_data(*)`)
//
// Field map to Supabase columns:
//   id, username, slug        → creator_profiles.username (primary key)
//   display_name              → creator_profiles.display_name
//   template                  → page_data.template_type
//   category                  → creator_profiles.category
//   plan                      → creator_profiles.plan
//   status                    → creator_profiles.status  ('pending'|'building'|'live')
//   featured                  → creator_profiles.featured (boolean)
//   sort_order                → creator_profiles.sort_order (int, ascending)
//   location                  → creator_profiles.location
//   avatar_initials           → creator_profiles.avatar_initials
//   avatar_color              → creator_profiles.avatar_color (key from AVATAR_COLORS)
//   page_url                  → creator_profiles.page_url (null until live)
//   status_quote              → creator_profiles.status_quote
//   tags                      → creator_profiles.tags (text[])
//   tagline                   → page_data.tagline
//   hero_sub                  → page_data.hero_sub
//   bio_paragraphs            → page_data.bio_paragraphs (jsonb [])
//   quick_info                → page_data.quick_info (jsonb [])
//   stats                     → page_data.stats (jsonb [{value, label}])
//   links                     → page_data.links (jsonb [{platform, url, label, icon}])
//   works                     → page_data.works (jsonb [{type, title, desc, badge}])
//   services                  → page_data.services (jsonb — business only)
//   hours                     → page_data.hours (jsonb — business only)
//   contact                   → page_data.contact (jsonb — business only)
//   accent_color              → page_data.accent_color (CSS value or var())
//   created_at                → creator_profiles.created_at (ISO timestamp)
// ────────────────────────────────────────────────────────────────────
export const CREATORS = [

  // ── 1. DJ FACELESS ANIMAL ─────────────────────────────────────────
  // [SUPABASE]: creator_profiles WHERE username = 'djfacelessanimal'
  {
    id:               'djfacelessanimal',
    username:         'djfacelessanimal',
    slug:             'djfacelessanimal',
    display_name:     'DJ Faceless Animal',
    template:         'creator',
    category:         'music',
    plan:             'pro',
    status:           'live',
    featured:         true,
    sort_order:       0,
    location:         'Providence, Rhode Island',
    avatar_initials:  'DJ',
    avatar_color:     'gold',
    page_url:         'artists/djfacelessanimal.html',
    status_quote:     '"Blends. Pressure. Presence. Underground sounds built for people who don\'t need the spotlight explained to them."',
    tags:             ['DJ', 'Producer', 'Electronic'],
    created_at:       '2025-01-01T00:00:00Z',

    // page_data fields
    tagline:          'Underground DJ and producer. Electronic, hip-hop, and experimental.',
    hero_sub:         'The platform exists because the right tools weren\'t available — so he built them.',
    bio_paragraphs:   [
      'Underground DJ and producer out of Providence. Blending raw electronic, hip-hop, and experimental sounds since before the algorithm cared.',
      'Founder of Faceless Animal Studios. Resident at venues across New England. Mixing for selectors, not playlists.',
    ],
    quick_info:       [
      'Based in Providence, Rhode Island',
      'Performing since 2016',
      'Genres: Electronic, Hip-Hop, Experimental',
      'Resident DJ — local circuit',
      'Studio founder and platform operator',
    ],
    stats:            [
      { value: '8+',   label: 'Years Active'   },
      { value: '200+', label: 'Sets Performed'  },
      { value: '4',    label: 'Active Releases' },
    ],
    links:            [
      { platform: 'spotify', url: 'https://open.spotify.com/artist/0pO4yejvRakRu8CzXlRwan?si=yUUVT_jnSsaaQQ5ZEWjY5g', label: 'Spotify', icon: '♫' },
      { platform: 'youtube', url: 'https://youtube.com/channel/UCwIlRTdYZUnQ5-KsLHGNIRg?si=yGEYnYj6mN_qCTHh',         label: 'YouTube', icon: '▶' },
      { platform: 'cashapp', url: 'https://cash.app/$Jamespropane00',                                                   label: 'Support on Cash App', icon: '$' },
    ],
    works:            [
      { type: 'music', title: 'Recent Sets',      desc: 'Live recordings from local venues and private events.',    badge: 'Live Mix'  },
      { type: 'music', title: 'Studio Originals', desc: 'Original productions blending electronic and hip-hop.',    badge: 'Original'  },
      { type: 'music', title: 'Collaborations',   desc: 'Joint projects with underground producers and vocalists.', badge: 'Collab'    },
    ],
    accent_color:     'var(--gold)',
    services:         null,
    hours:            null,
    contact:          { email: 'djfacelessanimal@gmail.com' },
  },


  // ── 2. STAGES OF MAZES ────────────────────────────────────────────
  // [SUPABASE]: creator_profiles WHERE username = 'stagesofmazes'
  {
    id:               'stagesofmazes',
    username:         'stagesofmazes',
    slug:             'stagesofmazes',
    display_name:     'Stages of Mazes',
    template:         'creator',
    category:         'games',
    plan:             'pro',
    status:           'building',
    featured:         true,
    sort_order:       1,
    location:         'Faceless Animal Studios',
    avatar_initials:  'SoM',
    avatar_color:     'blue',
    page_url:         null,
    status_quote:     '"Navigate worlds built from the inside out. Labyrinthine puzzle platformer — coming from the studio. In development."',
    tags:             ['Game Dev', 'Puzzle', 'Studio-Built'],
    created_at:       '2025-03-01T00:00:00Z',

    tagline:          'Labyrinthine puzzle platformer built inside the studio ecosystem.',
    hero_sub:         'Navigate worlds constructed from the inside out — levels that feel like they were designed by someone who\'s been lost in the right way.',
    bio_paragraphs:   [
      'Studio-built puzzle platformer in active development under the Faceless Animal Studios label.',
      'Stages of Mazes is a labyrinthine game where the architecture is the narrative. No enemies. No timers. Just pressure.',
    ],
    quick_info:       [
      'Full release coming from the studio',
      'Platform: Web + Native (TBD)',
      'Genre: Puzzle Platformer',
      'Built with the same underground aesthetic as the studio',
    ],
    stats:            [
      { value: 'Beta',  label: 'Current Stage'  },
      { value: '12+',   label: 'Levels Designed' },
      { value: '2026',  label: 'Target Release'  },
    ],
    links:            [],
    works:            [
      { type: 'game', title: 'Level 01 — Threshold', desc: 'Introductory level. The ground shifts.', badge: 'Playable Demo' },
      { type: 'game', title: 'The Archive',           desc: 'Multi-room navigation puzzle. In design.', badge: 'In Design'   },
    ],
    accent_color:     '#5aabdc',
    services:         null,
    hours:            null,
    contact:          { email: 'djfacelessanimal@gmail.com' },
  },


  // ── 3. KOLD VISUAL ───────────────────────────────────────────────
  // [SUPABASE]: creator_profiles WHERE username = 'koldvisual'
  {
    id:               'koldvisual',
    username:         'koldvisual',
    slug:             'koldvisual',
    display_name:     'KOLD Visual',
    template:         'creator',
    category:         'visual',
    plan:             'free',
    status:           'live',
    featured:         false,
    sort_order:       2,
    location:         'Providence, Rhode Island',
    avatar_initials:  'KV',
    avatar_color:     'red',
    page_url:         'artists/samplecreator.html',
    status_quote:     '"Motion graphics, brand identity, and visual direction for underground artists and independent labels. The work speaks before the name does."',
    tags:             ['Visual Artist', 'Photographer'],
    created_at:       '2025-02-15T00:00:00Z',

    tagline:          'Dark frames. Urban pressure. Still images that move.',
    hero_sub:         'Street photographer and digital artist working in high-contrast black & white and color-graded urban environments.',
    bio_paragraphs:   [
      'Street photographer working out of Providence. High-contrast black and white. Color grades that feel like they were shot in a city that doesn\'t sleep cleanly.',
      'Cover art, editorial photography, and visual direction for independent artists who don\'t want their visuals to look like everyone else\'s.',
    ],
    quick_info:       [
      'Based in Providence, Rhode Island',
      'Available for editorial, cover art, and brand projects',
      'Gear: Sony A7IV + vintage lenses',
      'Style: High-contrast, urban, documentary',
    ],
    stats:            [
      { value: '3+',  label: 'Years Active'       },
      { value: '40+', label: 'Projects Completed' },
      { value: '12+', label: 'Artists Worked With' },
    ],
    links:            [
      { platform: 'instagram', url: '#', label: 'Instagram', icon: '◉' },
      { platform: 'email',     url: 'mailto:djfacelessanimal@gmail.com', label: 'Book via Studio', icon: '✉' },
    ],
    works:            [
      { type: 'photo', title: 'Urban Black & White',  desc: 'Documentary street photography series.',     badge: 'Photo Series' },
      { type: 'photo', title: 'Cover Art Portfolio',  desc: 'Single and album artwork for local artists.', badge: 'Cover Art'    },
      { type: 'video', title: 'Motion Graphics Reel', desc: 'Brand identity animation and motion work.',   badge: 'Motion'       },
    ],
    accent_color:     '#dc6450',
    services:         null,
    hours:            null,
    contact:          { email: 'djfacelessanimal@gmail.com' },
  },


  // ── 4. RECLUSE BEATZ ─────────────────────────────────────────────
  // [SUPABASE]: creator_profiles WHERE username = 'reclusebeatz'
  // NOTE: page_url points to the shared sample page (placeholder).
  // In the full system, this creator gets templates/creator.html?slug=reclusebeatz
  {
    id:               'reclusebeatz',
    username:         'reclusebeatz',
    slug:             'reclusebeatz',
    display_name:     'Recluse Beatz',
    template:         'creator',
    category:         'producer',
    plan:             'free',
    status:           'live',
    featured:         false,
    sort_order:       3,
    location:         'New England',
    avatar_initials:  'RB',
    avatar_color:     'purple',
    page_url:         'artists/samplecreator.html',
    status_quote:     '"Lo-fi beats and underground sample flips. Making since 2019. Sample packs drop monthly on the platform — heavy on texture, easy on the drums."',
    tags:             ['Producer', 'Lo-Fi', 'Sample Artist'],
    created_at:       '2025-06-01T00:00:00Z',

    tagline:          'Lo-fi beats and underground sample flips since 2019.',
    hero_sub:         'Heavy on texture, easy on the drums. Sample packs drop monthly.',
    bio_paragraphs:   [
      'Beat producer from New England making lo-fi and underground-adjacent sample flips. Self-taught since 2019.',
      'Monthly sample packs, one-off beats for purchase, and the occasional collab track. Not chasing trends.',
    ],
    quick_info:       [
      'New England based producer',
      'Releasing beats since 2019',
      'DAW: FL Studio',
      'Monthly sample pack drops',
    ],
    stats:            [
      { value: '5+',  label: 'Years Producing' },
      { value: '60+', label: 'Beats Released'  },
      { value: '4',   label: 'Sample Packs'    },
    ],
    links:            [
      { platform: 'email', url: 'mailto:djfacelessanimal@gmail.com', label: 'Contact via Studio', icon: '✉' },
    ],
    works:            [
      { type: 'music', title: 'Monthly Sample Pack', desc: 'Curated lo-fi samples. New pack every month.',      badge: 'Sample Pack' },
      { type: 'music', title: 'Beat Catalog',         desc: 'Full beat catalog available for licensing.',         badge: 'For Sale'    },
      { type: 'music', title: 'Collab Tracks',         desc: 'Joint projects with vocalists and other producers.', badge: 'Collab'      },
    ],
    accent_color:     '#a06ae0',
    services:         null,
    hours:            null,
    contact:          { email: 'djfacelessanimal@gmail.com' },
  },


  // ── 5. BLACKOUT CUTS (EASTSIDE CUTS ON BOARD) ────────────────────
  // [SUPABASE]: creator_profiles WHERE username = 'blackoutcuts'
  // Note: display_name on board is "Eastside Cuts" (placeholder).
  // Real business name is "Blackout Cuts" on their page.
  {
    id:               'blackoutcuts',
    username:         'blackoutcuts',
    slug:             'blackoutcuts',
    display_name:     'Blackout Cuts',
    template:         'business',
    category:         'business',
    plan:             'starter',
    status:           'live',
    featured:         false,
    sort_order:       4,
    location:         'East Providence, Rhode Island',
    avatar_initials:  'EC',
    avatar_color:     'teal',
    page_url:         'business/samplebusiness.html',
    status_quote:     '"Barbershop on the east side. Fades, tapers, lineups, designs. Walk-ins welcome — book online if you want your spot guaranteed. Open 7 days."',
    tags:             ['Barbershop', 'Business'],
    created_at:       '2025-03-01T00:00:00Z',

    tagline:          'Fades, tapers, lineups, and designs. East Providence.',
    hero_sub:         'Walk-ins welcome. Book online if you want your spot.',
    bio_paragraphs:   [
      'East Providence barbershop specializing in fades, tapers, and precision lineups. Clean cuts, real craft, no fuss.',
      'Walk-ins always welcome. Book online to guarantee your time. Open seven days.',
    ],
    quick_info:       [
      'East Providence, Rhode Island',
      'Open 7 days a week',
      'Walk-ins welcome',
      'Online booking available',
    ],
    stats:            [
      { value: '7',   label: 'Days Open'         },
      { value: '400+', label: 'Clients Served'   },
      { value: '$10', label: 'Starting Price'    },
    ],
    links:            [
      { platform: 'phone',     url: 'tel:+14015550000',               label: '(401) 555-0000',   icon: '☎' },
      { platform: 'email',     url: 'mailto:djfacelessanimal@gmail.com', label: 'Email the Shop', icon: '✉' },
      { platform: 'instagram', url: '#',                               label: 'Instagram',        icon: '◉' },
    ],
    accent_color:     '#4abfa0',
    works:            null,
    services: [
      { num: '01', name: 'Fresh Cut',        price: '$20',     desc: 'Standard haircut with clean finish.',          addon: null          },
      { num: '02', name: 'Fade + Lineup',    price: '$25',     desc: 'Skin or scissor fade with edge lineup.',       addon: null          },
      { num: '03', name: 'Design Cut',       price: '$30–$40', desc: 'Custom geometric or freehand designs.',        addon: '+$10–$20'    },
      { num: '04', name: 'Kids Cut',         price: '$15',     desc: 'Under 12. Calm, patient, efficient.',          addon: null          },
      { num: '05', name: 'Beard Trim',       price: '$10',     desc: 'Shape, line, and clean up.',                   addon: 'Add-on: $10' },
      { num: '06', name: 'Full Package',     price: '$35',     desc: 'Fade + lineup + beard. The full treatment.',   addon: null          },
    ],
    hours: [
      { day: 'Monday',    time: 'Closed',        closed: true  },
      { day: 'Tuesday',   time: '10am – 7pm',    closed: false },
      { day: 'Wednesday', time: '10am – 7pm',    closed: false },
      { day: 'Thursday',  time: '10am – 7pm',    closed: false },
      { day: 'Friday',    time: '10am – 8pm',    closed: false },
      { day: 'Saturday',  time: '9am – 6pm',     closed: false },
      { day: 'Sunday',    time: '11am – 4pm',    closed: false },
    ],
    contact: {
      phone:   '(401) 555-0000',
      email:   'djfacelessanimal@gmail.com',
      address: 'East Providence, Rhode Island',
    },
  },

]


// ────────────────────────────────────────────────────────────────────
// BOARD POSTS / MESSAGES
// Future: creators post updates, releases, and collabs to the board.
// [SUPABASE CONNECT]:
//   supabase.from('board_posts')
//     .select(`*, creator_profiles(username, display_name, avatar_initials, avatar_color)`)
//     .eq('visible', true)
//     .order('created_at', { ascending: false })
//     .limit(20)
//
// Post types: 'release' | 'update' | 'collab' | 'announcement' | 'question'
// ────────────────────────────────────────────────────────────────────
export const POSTS = [
  {
    id:           'post-001',
    creator_id:   'djfacelessanimal',
    type:         'release',
    content:      'New mix tape session recorded live — raw cuts from the last three sets. Dropping on the page this week.',
    created_at:   '2026-03-15T00:00:00Z',
    pinned:       true,
    visible:      true,
  },
  {
    id:           'post-002',
    creator_id:   'reclusebeatz',
    type:         'release',
    content:      'March sample pack is live. 24 stems, all royalty-free for platform members. Free tier gets access.',
    created_at:   '2026-03-12T00:00:00Z',
    pinned:       false,
    visible:      true,
  },
  {
    id:           'post-003',
    creator_id:   'koldvisual',
    type:         'collab',
    content:      'Looking for a vocalist or MC for a visual project. Providence or remote. Reach out through the platform.',
    created_at:   '2026-03-10T00:00:00Z',
    pinned:       false,
    visible:      true,
  },
  {
    id:           'post-004',
    creator_id:   'stagesofmazes',
    type:         'update',
    content:      'Level 04 is in design. The maze has rooms that lead back to themselves. More soon.',
    created_at:   '2026-03-08T00:00:00Z',
    pinned:       false,
    visible:      true,
  },
]


// ────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// Work on the static CREATORS array now.
// Same interface works when CREATORS comes from a Supabase fetch.
// ────────────────────────────────────────────────────────────────────

/** Get a single creator record by username/slug */
export function getCreatorBySlug(slug) {
  return CREATORS.find(c => c.slug === slug || c.username === slug) || null
}

/** All creators with status === 'live' */
export function getLiveCreators() {
  return CREATORS.filter(c => c.status === 'live').sort((a, b) => a.sort_order - b.sort_order)
}

/** All creators with featured === true */
export function getFeaturedCreators() {
  return CREATORS.filter(c => c.featured).sort((a, b) => a.sort_order - b.sort_order)
}

/** All live creators in a given category */
export function getCreatorsByCategory(categoryId) {
  return CREATORS.filter(c => c.status === 'live' && c.category === categoryId)
}

/** Category definition by id */
export function getCategoryById(categoryId) {
  return CATEGORIES.find(c => c.id === categoryId) || CATEGORIES[CATEGORIES.length - 1]
}

/** Avatar inline styles string for a creator — used in board card HTML */
export function avatarStyle(colorKey) {
  const c = AVATAR_COLORS[colorKey] || AVATAR_COLORS.neutral
  return `background:${c.bg};border-color:${c.border};color:${c.color};`
}

/** Plan label for board cards and admin table */
export function planLabel(planKey) {
  return PLANS[planKey]?.label || 'Free Page'
}

/** Category tag class for board cards */
export function categoryTagClass(categoryId) {
  return getCategoryById(categoryId)?.tagClass || 'creator-tag--open'
}

/** Creator's primary display tag string (first two tags joined) */
export function primaryTag(creator) {
  return creator.tags?.slice(0, 2).join(' · ') || getCategoryById(creator.category)?.label || 'Creator'
}
