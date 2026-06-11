// assets/js/session-bootstrap.js
// Shared member session bootstrap utility
// Usage: Call sessionBootstrap() on any member/builder page

function sessionBootstrap() {
  const fasUserRaw = localStorage.getItem('fas_user');
  if (!fasUserRaw) {
    location.replace('login.html');
    return null;
  }
  let fasUser;
  try {
    fasUser = JSON.parse(fasUserRaw);
  } catch (e) {
    location.replace('login.html');
    return null;
  }
  if (!fasUser || !fasUser.account_id || !fasUser.username || !fasUser.signal_id) {
    location.replace('login.html');
    return null;
  }
  return fasUser;
}

window.sessionBootstrap = sessionBootstrap;