// Public values only. The anon key is designed to be public: it can't do
// anything the database's rules don't already allow.
export const SUPABASE_URL = "https://yxsqvopsvjknudjhfyoh.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4c3F2b3BzdmprbnVkamhmeW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMTgxNzEsImV4cCI6MjEwNTY5NDE3MX0.LUgJiN26gjqNDzhlTyor06aswgj95g51uaXkn6zMmSc";

// export const LOCAL_API_URL = "http://192.168.1.6:8001";
//this is my local i need it to test the app on my local
export const LOCAL_API_URL = "http://192.168.106.172:8001";

export const PRODUCTION_API_URL = "https://ea-mcwt.onrender.com";

const API_ENVIRONMENT = process.env.EXPO_PUBLIC_API_ENVIRONMENT || "local";

export const API_BASE_URL =
  API_ENVIRONMENT === "production" ? PRODUCTION_API_URL : LOCAL_API_URL;
