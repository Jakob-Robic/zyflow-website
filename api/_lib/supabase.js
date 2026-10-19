'use strict';

const { createClient } = require('@supabase/supabase-js');

let client;

function getSupabase() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_KEY || '').trim();
  if (!url || !key) {
    throw new Error('supabase env missing');
  }
  if (!client) {
    client = createClient(url, key);
  }
  return client;
}

function resetSupabaseClient() {
  client = null;
}

module.exports = {
  getSupabase,
  resetSupabaseClient,
};
