/**
 * SIGNAL BOARD — Index Page Controller
 * assets/js/board-index.js
 * 
 * Handles 3-column layout interactions:
 * - User session detection (guest vs member)
 * - Identity card display
 * - Post modal gate + composer
 * - Form submission
 * - Logout
 */

/**
 * Get current user session
 */
function getViewerSession() {
  try {
    const sess = JSON.parse(localStorage.getItem('fas_user') || 'null')
    return sess && sess.username ? sess : null
  } catch (_) {
    return null
  }
}

/**
 * Initialize board state
 */
function initBoardState() {
  const session = getViewerSession()
  const isGuest = !session

  // Update left sidebar
  updateIdentitySidebar(session, isGuest)
  
  // Show/hide auth elements
  const guestAuthBlock = document.getElementById('sidebar-auth-guest')
  const memberAuthBlock = document.getElementById('sidebar-auth-member')
  const navDashboard = document.getElementById('nav-dashboard')

  if (isGuest) {
    guestAuthBlock.style.display = 'block'
    memberAuthBlock.style.display = 'none'
    if (navDashboard) navDashboard.style.display = 'none'
  } else {
    guestAuthBlock.style.display = 'none'
    memberAuthBlock.style.display = 'block'
    if (navDashboard) navDashboard.style.display = 'flex'
  }

  // Setup modal handlers
  setupPostModal(isGuest)

  // Setup logout handler
  setupLogout()
}

/**
 * Update identity sidebar
 */
function updateIdentitySidebar(session, isGuest) {
  const handleEl = document.getElementById('user-handle')
  const idEl = document.getElementById('user-signal-id')
  const avatarEl = document.getElementById('user-avatar-placeholder')

  if (isGuest) {
    handleEl.textContent = 'Guest'
    idEl.textContent = 'Signal ID: —'
    avatarEl.textContent = '◉'
  } else {
    const username = session.username || 'User'
    const displayName = session.display || username
    const signalId = session.platform_id || 'new'
    
    handleEl.textContent = '@' + username
    idEl.textContent = 'Signal ID: ' + signalId
    
    // Avatar initials
    const initials = displayName
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase()
    avatarEl.textContent = initials || '◉'
  }
}

/**
 * Setup post modal interactions
 */
function setupPostModal(isGuest) {
  const dropSignalBtn = document.getElementById('drop-signal-btn')
  const modalOverlay = document.getElementById('post-modal-overlay')
  const gateModal = document.getElementById('post-modal-gate')
  const composeModal = document.getElementById('post-modal-compose')
  
  const closeGateBtn = document.getElementById('modal-close-gate')
  const closeComposeBtn = document.getElementById('modal-close-compose')
  const cancelBtn = document.getElementById('modal-cancel')
  const postForm = document.getElementById('post-form')
  const charCountEl = document.getElementById('char-count')
  const signalTextEl = document.getElementById('signal-text')
  const postLoadingEl = document.getElementById('post-loading')
  const postSuccessEl = document.getElementById('post-success')

  // Show appropriate modal on button click
  dropSignalBtn.addEventListener('click', () => {
    if (isGuest) {
      gateModal.style.display = 'block'
      composeModal.style.display = 'none'
    } else {
      gateModal.style.display = 'none'
      composeModal.style.display = 'block'
    }
    modalOverlay.style.display = 'flex'
  })

  // Close modal handlers
  function closeModal() {
    modalOverlay.style.display = 'none'
    gateModal.style.display = 'none'
    composeModal.style.display = 'none'
    resetForm()
  }

  closeGateBtn.addEventListener('click', closeModal)
  closeComposeBtn.addEventListener('click', closeModal)
  cancelBtn.addEventListener('click', closeModal)

  // Close on outside click
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal()
  })

  // Character counter
  signalTextEl.addEventListener('input', () => {
    const len = signalTextEl.value.length
    charCountEl.textContent = `${len} / 280`
    charCountEl.style.color = len > 250 ? 'rgba(239,68,68,0.8)' : 'var(--text-3)'
  })

  // Signal type button selection
  document.querySelectorAll('.signal-type-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      document.querySelectorAll('.signal-type-btn').forEach(b => {
        b.setAttribute('aria-pressed', 'false')
      })
      btn.setAttribute('aria-pressed', 'true')
    })
  })

  // Form submission
  if (!isGuest) {
    postForm.addEventListener('submit', async (e) => {
      e.preventDefault()

      const text = signalTextEl.value.trim()
      if (!text) return

      const signalType = document.querySelector('.signal-type-btn[aria-pressed="true"]')?.dataset.type || 'drop'

      // Show loading state
      postForm.style.display = 'none'
      postLoadingEl.style.display = 'block'

      try {
        // Import board.js for posting
        const { createBoardPost } = await import('./services/board.js')
        const session = getViewerSession()

        await createBoardPost({
          username: session.username,
          display_name: session.display || session.username,
          platform_id: session.platform_id,
          content: text,
          signal_type: signalType,
          boost_count: 0,
        })

        // Show success
        postLoadingEl.style.display = 'none'
        postSuccessEl.style.display = 'block'

        // Close after short delay
        setTimeout(() => {
          closeModal()
          // Refresh board feed if function exists
          if (window.initPostsFeed) {
            window.initPostsFeed()
          }
        }, 1200)

      } catch (err) {
        console.error('Post failed:', err)
        alert('Failed to drop signal. Try again.')
        
        postLoadingEl.style.display = 'none'
        postForm.style.display = 'block'
      }
    })
  }

  function resetForm() {
    signalTextEl.value = ''
    charCountEl.textContent = '0 / 280'
    charCountEl.style.color = 'var(--text-3)'
    
    postForm.style.display = 'block'
    postLoadingEl.style.display = 'none'
    postSuccessEl.style.display = 'none'

    document.querySelector('.signal-type-btn[data-type="drop"]')?.setAttribute('aria-pressed', 'true')
    document.querySelectorAll('.signal-type-btn:not([data-type="drop"])').forEach(b => {
      b.setAttribute('aria-pressed', 'false')
    })
  }
}

/**
 * Setup logout handler
 */
function setupLogout() {
  const logoutBtn = document.getElementById('logout-btn')
  if (!logoutBtn) return

  logoutBtn.addEventListener('click', async () => {
    // Clear session
    localStorage.removeItem('fas_user')
    
    // Redirect to index or show message
    window.location.href = 'index.html'
  })
}

/**
 * Simulate live activity updates (for demo)
 */
function setupLiveActivity() {
  const activityList = document.getElementById('activity-list')
  const listenerCountEl = document.getElementById('radio-listener-count')

  // Simulate activity
  const activities = [
    '@jimi just joined',
    '@renee posted',
    '@ariana went live',
    'New signals incoming',
    'Network active',
  ]

  function addActivity() {
    const text = activities[Math.floor(Math.random() * activities.length)]
    
    const item = document.createElement('p')
    item.className = 'activity-item'
    item.textContent = text

    activityList.insertBefore(item, activityList.firstChild)
    
    // Keep only 6 items
    while (activityList.children.length > 6) {
      activityList.removeChild(activityList.lastChild)
    }
  }

  // Add activity every 5-8 seconds
  setInterval(addActivity, 5000 + Math.random() * 3000)

  // Simulate listener count changes
  let count = 27
  setInterval(() => {
    count = Math.max(18, Math.min(45, count + (Math.random() < 0.6 ? 1 : -1)))
    listenerCountEl.textContent = count + ' listening'
  }, 4000)
}

/**
 * Initialize on DOM ready
 */
function init() {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
    return
  }

  initBoardState()
  setupLiveActivity()

  console.log('Signal Board initialized')
}

// Start
init()
