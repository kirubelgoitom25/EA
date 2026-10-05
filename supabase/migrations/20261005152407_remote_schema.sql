SET local check_function_bodies = off;

CREATE SEQUENCE "public"."lesson_progress_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."practice_attempts_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."practice_items_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."practices_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."quiz_attempts_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."quiz_questions_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."quizzes_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE SEQUENCE "public"."xp_events_id_seq" AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1 NO CYCLE;

CREATE TABLE "public"."class_courses" (
  "class_id"  text NOT NULL,
  "course_id" text NOT NULL,
  CONSTRAINT "class_courses_pkey" PRIMARY KEY (class_id, course_id)
);

ALTER TABLE "public"."class_courses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."class_teachers" (
  "class_id"   text NOT NULL,
  "teacher_id" uuid NOT NULL,
  CONSTRAINT "class_teachers_pkey" PRIMARY KEY (class_id, teacher_id)
);

ALTER TABLE "public"."class_teachers"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."classes" (
  "id"         text                     NOT NULL,
  "name"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "classes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."classes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."courses" (
  "id"          text    NOT NULL,
  "title"       text    NOT NULL,
  "description" text    NOT NULL,
  "sort_order"  integer NOT NULL DEFAULT 0,
  CONSTRAINT "courses_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."courses"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."lesson_progress" (
  "id"           integer                  NOT NULL DEFAULT nextval('public.lesson_progress_id_seq'::regclass),
  "student_id"   uuid                     NOT NULL,
  "lesson_id"    text                     NOT NULL,
  "completed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "lesson_progress_pkey" PRIMARY KEY (id),
  CONSTRAINT "lesson_progress_student_id_lesson_id_key" UNIQUE (student_id, lesson_id)
);

ALTER TABLE "public"."lesson_progress"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."lessons" (
  "id"         text    NOT NULL,
  "module_id"  text    NOT NULL,
  "title"      text    NOT NULL,
  "duration"   text,
  "video_url"  text,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "lessons_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."lessons"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."modules" (
  "id"         text    NOT NULL,
  "course_id"  text    NOT NULL,
  "title"      text    NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "modules_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."modules"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."practice_attempts" (
  "id"                  integer                  NOT NULL DEFAULT nextval('public.practice_attempts_id_seq'::regclass),
  "student_id"          uuid                     NOT NULL,
  "practice_id"         integer                  NOT NULL,
  "score"               integer                  NOT NULL,
  "total_items"         integer                  NOT NULL,
  "xp_earned"           numeric(6,2)             NOT NULL,
  "is_first_completion" boolean                  NOT NULL,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "practice_attempts_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."practice_attempts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."practice_items" (
  "id"            integer NOT NULL DEFAULT nextval('public.practice_items_id_seq'::regclass),
  "practice_id"   integer NOT NULL,
  "type"          text    NOT NULL,
  "question"      text    NOT NULL,
  "sentence"      text,
  "options"       jsonb,
  "answer"        text,
  "correct_index" integer,
  "sort_order"    integer NOT NULL DEFAULT 0,
  "explanation"   text,
  CONSTRAINT "practice_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "practice_items_type_check" CHECK ((type = ANY (ARRAY['fill'::text, 'choose'::text])))
);

ALTER TABLE "public"."practice_items"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."practices" (
  "id"        integer NOT NULL DEFAULT nextval('public.practices_id_seq'::regclass),
  "lesson_id" text    NOT NULL,
  "title"     text    NOT NULL,
  CONSTRAINT "practices_lesson_id_key" UNIQUE (lesson_id),
  CONSTRAINT "practices_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."practices"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"         uuid                     NOT NULL,
  "name"       text                     NOT NULL,
  "role"       text                     NOT NULL DEFAULT 'student'::text,
  "is_active"  boolean                  NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "class_id"   text,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text])))
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."quiz_attempts" (
  "id"              integer                  NOT NULL DEFAULT nextval('public.quiz_attempts_id_seq'::regclass),
  "student_id"      uuid                     NOT NULL,
  "quiz_id"         integer                  NOT NULL,
  "attempt_number"  integer                  NOT NULL,
  "score"           integer                  NOT NULL,
  "total_questions" integer                  NOT NULL,
  "xp_earned"       numeric(6,2)             NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY (id),
  CONSTRAINT "uq_quiz_attempt" UNIQUE (student_id, quiz_id, attempt_number)
);

ALTER TABLE "public"."quiz_attempts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."quiz_questions" (
  "id"            integer NOT NULL DEFAULT nextval('public.quiz_questions_id_seq'::regclass),
  "quiz_id"       integer NOT NULL,
  "question"      text    NOT NULL,
  "options"       jsonb   NOT NULL,
  "correct_index" integer NOT NULL,
  "sort_order"    integer NOT NULL DEFAULT 0,
  "explanation"   text,
  CONSTRAINT "quiz_questions_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."quiz_questions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."quizzes" (
  "id"        integer NOT NULL DEFAULT nextval('public.quizzes_id_seq'::regclass),
  "lesson_id" text    NOT NULL,
  CONSTRAINT "quizzes_lesson_id_key" UNIQUE (lesson_id),
  CONSTRAINT "quizzes_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."quizzes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."streaks" (
  "student_id"         uuid    NOT NULL,
  "current_streak"     integer NOT NULL DEFAULT 0,
  "longest_streak"     integer NOT NULL DEFAULT 0,
  "last_activity_date" date,
  CONSTRAINT "streaks_pkey" PRIMARY KEY (student_id)
);

ALTER TABLE "public"."streaks"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."xp_events" (
  "id"         integer                  NOT NULL DEFAULT nextval('public.xp_events_id_seq'::regclass),
  "student_id" uuid                     NOT NULL,
  "amount"     numeric(6,2)             NOT NULL,
  "source"     text                     NOT NULL,
  "source_id"  integer                  NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "xp_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "xp_events_source_check" CHECK ((source = ANY (ARRAY['quiz'::text, 'practice'::text])))
);

ALTER TABLE "public"."xp_events"
  ENABLE ROW LEVEL SECURITY;

ALTER SEQUENCE "public"."lesson_progress_id_seq" OWNED BY "public"."lesson_progress"."id";

ALTER SEQUENCE "public"."practice_attempts_id_seq" OWNED BY "public"."practice_attempts"."id";

ALTER SEQUENCE "public"."practice_items_id_seq" OWNED BY "public"."practice_items"."id";

ALTER SEQUENCE "public"."practices_id_seq" OWNED BY "public"."practices"."id";

ALTER SEQUENCE "public"."quiz_attempts_id_seq" OWNED BY "public"."quiz_attempts"."id";

ALTER SEQUENCE "public"."quiz_questions_id_seq" OWNED BY "public"."quiz_questions"."id";

ALTER SEQUENCE "public"."quizzes_id_seq" OWNED BY "public"."quizzes"."id";

ALTER SEQUENCE "public"."xp_events_id_seq" OWNED BY "public"."xp_events"."id";

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

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
  RETURNS event_trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

ALTER TABLE "public"."class_courses"
  ADD CONSTRAINT "class_courses_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_teachers"
  ADD CONSTRAINT "class_teachers_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_courses"
  ADD CONSTRAINT "class_courses_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

ALTER TABLE "public"."modules"
  ADD CONSTRAINT "modules_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE "public"."lessons"
  ADD CONSTRAINT "lessons_module_id_fkey" FOREIGN KEY (module_id) REFERENCES public.modules(id) ON DELETE CASCADE;

ALTER TABLE "public"."practices"
  ADD CONSTRAINT "practices_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

ALTER TABLE "public"."practice_attempts"
  ADD CONSTRAINT "practice_attempts_practice_id_fkey" FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE CASCADE;

ALTER TABLE "public"."practice_items"
  ADD CONSTRAINT "practice_items_practice_id_fkey" FOREIGN KEY (practice_id) REFERENCES public.practices(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.classes(id);

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."class_teachers"
  ADD CONSTRAINT "class_teachers_teacher_id_fkey" FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."lesson_progress"
  ADD CONSTRAINT "lesson_progress_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."practice_attempts"
  ADD CONSTRAINT "practice_attempts_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."quizzes"
  ADD CONSTRAINT "quizzes_lesson_id_fkey" FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

ALTER TABLE "public"."quiz_attempts"
  ADD CONSTRAINT "quiz_attempts_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE "public"."quiz_questions"
  ADD CONSTRAINT "quiz_questions_quiz_id_fkey" FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE;

ALTER TABLE "public"."streaks"
  ADD CONSTRAINT "streaks_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."xp_events"
  ADD CONSTRAINT "xp_events_student_id_fkey" FOREIGN KEY (student_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX uq_practice_first_completion ON public.practice_attempts USING btree (student_id, practice_id)
  WHERE is_first_completion;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE EVENT TRIGGER "ensure_rls"
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION "public"."rls_auto_enable"();

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."rls_auto_enable"() TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."lesson_progress_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."lesson_progress_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."lesson_progress_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."lesson_progress_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practice_attempts_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."practice_attempts_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practice_attempts_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practice_attempts_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practice_items_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."practice_items_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practice_items_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practice_items_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practices_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."practices_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practices_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."practices_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quiz_attempts_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."quiz_attempts_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quiz_attempts_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quiz_attempts_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quiz_questions_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."quiz_questions_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quiz_questions_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quiz_questions_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quizzes_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."quizzes_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quizzes_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."quizzes_id_seq" TO "service_role";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."xp_events_id_seq" TO "anon", "authenticated";

REVOKE ALL ON SEQUENCE "public"."xp_events_id_seq" FROM "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."xp_events_id_seq" TO "postgres";

GRANT SELECT, UPDATE, USAGE ON SEQUENCE "public"."xp_events_id_seq" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_courses" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."class_courses" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_courses" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_courses" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_teachers" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."class_teachers" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_teachers" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."class_teachers" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."classes" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."classes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."classes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."classes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."courses" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."courses" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."courses" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."courses" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lesson_progress" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."lesson_progress" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lesson_progress" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lesson_progress" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lessons" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."lessons" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lessons" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lessons" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."modules" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."modules" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."modules" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."modules" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practice_attempts" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."practice_attempts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practice_attempts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practice_attempts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practice_items" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."practice_items" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practice_items" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practice_items" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practices" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."practices" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practices" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."practices" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_attempts" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."quiz_attempts" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_attempts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_attempts" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_questions" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."quiz_questions" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_questions" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quiz_questions" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quizzes" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."quizzes" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quizzes" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quizzes" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."streaks" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."streaks" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."streaks" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."streaks" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."xp_events" TO "anon", "authenticated";

REVOKE ALL ON TABLE "public"."xp_events" FROM "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."xp_events" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."xp_events" TO "service_role";

