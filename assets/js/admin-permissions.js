export const ROLE = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MODERATOR: 'moderator',
  USER: 'user',
};

export const STATUS = {
  ACTIVE: 'active',
  WARNED: 'warned',
  LIMITED: 'limited',
  SUSPENDED: 'suspended',
  BANNED: 'banned',
};

const PREMIUM_TIERS = new Set([
  'premium',
  'gifted_premium',
  'trial_premium',
  'lifetime_premium',
]);

export function getUserRole(user) {
  return (user && user.role) || ROLE.USER;
}

export function isSuperAdmin(user) {
  return getUserRole(user) === ROLE.SUPER_ADMIN;
}

export function getMembershipTier(user) {
  return (user && user.membership_tier) || 'free';
}

export function getAccountStatus(user) {
  return (user && user.account_status) || STATUS.ACTIVE;
}

export function isPremiumActive(user) {
  if (!user) return false;
  const tier = getMembershipTier(user);
  if (!PREMIUM_TIERS.has(tier)) return false;
  if (tier === 'lifetime_premium') return true;
  if (!user.premium_expires_at) return true;
  return new Date(user.premium_expires_at).getTime() > Date.now();
}

export function isUserRestricted(user) {
  const status = getAccountStatus(user);
  return (
    status === STATUS.LIMITED ||
    status === STATUS.SUSPENDED ||
    status === STATUS.BANNED
  );
}

export function hasPermission(user, permissionKey, overrides = null) {
  const status = getAccountStatus(user);

  if (status === STATUS.BANNED || status === STATUS.SUSPENDED) {
    return false;
  }

  if (isSuperAdmin(user)) return true;

  const role = getUserRole(user);

  const roleDefaults = {
    admin: {
      manageUsers: true,
      viewAdminLogs: true,
      manageMembership: true,
      enforceUsers: true,
      moderateContent: true,
      can_upload_music: true,
      can_send_messages: true,
      can_vote_on_radio: true,
      can_make_calls: true,
    },
    moderator: {
      manageUsers: false,
      viewAdminLogs: false,
      manageMembership: false,
      enforceUsers: true,
      moderateContent: true,
      can_upload_music: true,
      can_send_messages: true,
      can_vote_on_radio: true,
      can_make_calls: true,
    },
    user: {
      manageUsers: false,
      viewAdminLogs: false,
      manageMembership: false,
      enforceUsers: false,
      moderateContent: false,
      can_upload_music: true,
      can_send_messages: true,
      can_vote_on_radio: true,
      can_make_calls: true,
    },
  };

  let allowed = Boolean((roleDefaults[role] || roleDefaults.user)[permissionKey]);

  if (status === STATUS.LIMITED) {
    if (permissionKey === 'can_upload_music') allowed = false;
    if (permissionKey === 'can_make_calls') allowed = false;
  }

  if (overrides && Object.prototype.hasOwnProperty.call(overrides, permissionKey)) {
    const overrideVal = overrides[permissionKey];
    if (overrideVal === true || overrideVal === false) {
      allowed = overrideVal;
    }
  }

  return allowed;
}