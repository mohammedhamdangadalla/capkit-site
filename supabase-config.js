// ═══ Supabase Configuration ═══

const SUPABASE_URL = 'https://dsgbnulewdxxftmrqrrr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-YDp-ImPkEOhA4_cKWOJAA_d_2_wJkP';

// تهيئة العميل
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// للاستخدام في باقي الملفات
window.supabaseClient = supabaseClient;
window.SUPABASE_URL = SUPABASE_URL;
