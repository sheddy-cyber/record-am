import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[Record Am] Missing Supabase credentials.\n' +
    'Make sure your .env file contains:\n' +
    '  EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key\n' +
    'Then restart with: npx expo start --clear'
  );
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
