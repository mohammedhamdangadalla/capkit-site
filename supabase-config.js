const SUPABASE_URL = 'https://dsgbnulewdxxftmrqrrr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-YDp-ImPkEOhA4_cKWOJAA_d_2_wJkP';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,      // حفظ الجلسة في المتصفح
    autoRefreshToken: true,    // تجديد التوكن تلقائياً
    detectSessionInUrl: true   // قراءة التوكن عند العودة من جوجل
  }
});

window.supabaseClient = supabaseClient;
window.SUPABASE_URL = SUPABASE_URL;
