// scripts/backfill_auth_users.js
// One-time backfill: link all existing accounts to Supabase Auth users

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('RAW SUPABASE_URL:', JSON.stringify(process.env.SUPABASE_URL));
console.log('KEY EXISTS:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function main() {
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, username, internal_email, auth_user_id')
    .is('auth_user_id', null);

  if (error) {
    console.error('Error fetching accounts:', error);
    process.exit(1);
  }

  for (const account of accounts) {
    const username = account.username;
    let internal_email = account.internal_email;
    if (!internal_email) {
      internal_email = `${username.toLowerCase()}@auth.faceless.internal`;
    }
    let authUserId = null;
    let createRes = await supabase.auth.admin.createUser({
      email: internal_email,
      password: `TempPass!${Math.random().toString(36).slice(2, 10)}`,
      email_confirm: true
    });
    if (createRes.error) {
      if (
        createRes.error.message &&
        createRes.error.message.toLowerCase().includes('already registered')
      ) {
        // Find user by email using admin listUsers
        let found = false;
        let nextPage = null;
        do {
          const { data: userList, error: listError } = await supabase.auth.admin.listUsers({ page: nextPage });
          if (listError) {
            console.error(`Failed to list users for ${username}:`, listError);
            break;
          }
          for (const user of userList.users) {
            if (user.email && user.email.toLowerCase() === internal_email.toLowerCase()) {
              authUserId = user.id;
              found = true;
              break;
            }
          }
          nextPage = userList.nextPage;
        } while (!found && nextPage);
        if (!authUserId) {
          console.error(`Could not find existing Auth user for ${username} (${internal_email})`);
          continue;
        }
      } else {
        console.error(`Failed to create Auth user for ${username}:`, createRes.error);
        continue;
      }
    } else {
      authUserId = createRes.data.user.id;
    }
    const { error: updateError } = await supabase
      .from('accounts')
      .update({ auth_user_id: authUserId, internal_email })
      .eq('id', account.id);
    if (updateError) {
      console.error(`Failed to update account ${account.id}:`, updateError);
    } else {
      console.log(`Linked Auth user for ${username}`);
    }
  }
}

main();
