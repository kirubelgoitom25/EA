// Public values only. The anon key is designed to be public: it can't do
// anything the database's rules don't already allow.
export const SUPABASE_URL = "https://yxsqvopsvjknudjhfyoh.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4c3F2b3BzdmprbnVkamhmeW9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxMTgxNzEsImV4cCI6MjEwNTY5NDE3MX0.LUgJiN26gjqNDzhlTyor06aswgj95g51uaXkn6zMmSc";

export const PRODUCTION_API_URL = "https://ea-mcwt.onrender.com";
// EXPO_PUBLIC_API_URL points a dev build at a local backend; unset means production.
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || PRODUCTION_API_URL;

// The fox and the dotted line on a course's path (CourseScreen): "title" (she stands on the current
// chapter's title; the dots drift along), "edge" (her head peeks in from the screen's edge; the line
// into the current chapter glows) or "ledge" (she stands on the tab bar; dark dots run to the current
// chapter).
export const mascotVariant = "title"; // 'title' | 'edge' | 'ledge'
