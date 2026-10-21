SET local check_function_bodies = off;

CREATE SCHEMA "pgrst_no_exposed_schemas";

CREATE TABLE "public"."student_presence" (
  "student_id"        uuid                     NOT NULL,
  "last_seen_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "current_lesson_id" text,
  CONSTRAINT "student_presence_pkey" PRIMARY KEY (student_id)
);

ALTER TABLE "public"."student_presence"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."student_presence" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'student'
  );
  return new;
end;
$function$;

ALTER TABLE "public"."student_presence"
  ADD CONSTRAINT "student_presence_current_lesson_id_fkey" FOREIGN KEY (current_lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;

ALTER TABLE "public"."student_presence"
  ADD CONSTRAINT "student_presence_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

REVOKE ALL ON TABLE "public"."student_presence" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_presence" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."student_presence" TO "service_role";