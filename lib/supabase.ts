import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://xmizawuhiounkiaqrwxd.supabase.co';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtaXphd3VoaW91bmtpYXFyd3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNzgyMDYsImV4cCI6MjA5Mzc1NDIwNn0.3nf8utDfJW8gg2kNKItxljMW7p5C_LRDBknCM0bQT50';

export const supabase = createClient(url, key);
