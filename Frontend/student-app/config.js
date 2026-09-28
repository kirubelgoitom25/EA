// Public values only. The anon key is designed to be public: it can't do
// anything the database's rules don't already allow.
export const SUPABASE_URL = "https://yxsqvopsvjknudjhfyoh.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4c3F2b3BzdmprbnVkamhmeW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMTgxNzEsImV4cCI6MjEwNTY5NDE3MX0.LUgJiN26gjqNDzhlTyor06aswgj95g51uaXkn6zMmSc";

// While testing: your laptop's Wi-Fi IPv4 address (run ipconfig) + :8001.
// After hosting the backend: replace with the https URL of the hosted backend.
// 127.0.0.1 would mean "the phone itself", so it can't be used here.
export const API_BASE_URL = "http://192.168.213.172:8001";