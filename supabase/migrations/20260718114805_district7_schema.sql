/*
# District 7 — Full Schema & Security Model

## Overview
Creates the complete data model for District 7, a closed internal Work & Team Management CRM.
Maps the Firebase/Firestore spec to Supabase (Postgres + RLS). Auth uses Supabase
email/password. Roles ("admin" | "staff") live in auth.users.raw_app_meta_data so they are
JWT-immutable and queryable via `auth.jwt() -> 'app_metadata' ->> 'role'` in RLS policies.

## Tables
1. profiles — mirrors auth.users with workspace fields (name, title, role, status, must_reset_password, avatar_url).
2. projects — workspace projects with shade key + status.
3. project_members — many-to-many project <-> user membership.
4. tasks — tasks belonging to a project (status, priority, progress, position, due_date, assignee).
5. comments — comments on tasks.
6. time_logs — work-tracker + agent time entries (source: timer|auto|manual|agent).
7. events — calendar events (company|personal).
8. sticky_notes — blackboard notes with x/y/z + shade.
9. settings — key/value JSON workspace settings.
10. app_categories — pattern -> work|neutral|distraction classification.
11. agent_devices — registered desktop agent machines.
12. app_usage — per-app usage windows synced from desktop agent.
13. sessions_activity — daily rollup per user (focus/idle/distraction seconds + score).
14. activity_logs — audit trail of mutations.
15. presence — live blackboard viewer heartbeats.

## Security
- RLS enabled on EVERY table.
- Role check helper: is_admin() reads the JWT app_metadata role claim.
- Staff task writes limited to status/progress/position via a BEFORE UPDATE trigger
  that raises if a non-admin tries to change protected columns.
- sessions_activity and activity_logs are insertable only via service role (edge functions);
  users can read their own; admins read all.
- profiles: admin reads/writes all; staff reads all profiles (team awareness) but updates
  only own non-privileged fields (cannot touch role/status/must_reset_password).

## Notes
- `role` is stored in auth.users.raw_app_meta_data by the createTeamUser / setupInitialAdmin
  edge functions. The profiles table also stores role for convenience reads, but the RLS
  source of truth is the JWT claim.
- Default settings + default app_categories are seeded here so first run is usable.
- Default admin auth account is created by the `setupInitialAdmin` edge function on first run.
*/

-- ============================================================
-- Helper functions
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    (auth.jwt() ->> 'role') = 'admin',
    false
  );
$$;

-- ============================================================
-- profiles
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','staff')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  must_reset_password boolean NOT NULL DEFAULT true,
  avatar_url text,
  notif_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_all_authenticated"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_update_self_nonprivileged" ON public.profiles;
CREATE POLICY "profiles_update_self_nonprivileged"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND role = (SELECT role FROM public.profiles p2 WHERE p2.id = auth.uid())
  AND status = (SELECT status FROM public.profiles p2 WHERE p2.id = auth.uid())
  AND must_reset_password = (SELECT must_reset_password FROM public.profiles p2 WHERE p2.id = auth.uid())
);

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin"
ON public.profiles FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- projects
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'graphite' CHECK (color IN ('graphite','ash','slate','onyx','pearl')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','archived')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_authenticated" ON public.projects;
CREATE POLICY "projects_select_authenticated"
ON public.projects FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "projects_insert_admin" ON public.projects;
CREATE POLICY "projects_insert_admin"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() AND auth.uid() = created_by);

DROP POLICY IF EXISTS "projects_update_admin" ON public.projects;
CREATE POLICY "projects_update_admin"
ON public.projects FOR UPDATE
TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "projects_delete_admin" ON public.projects;
CREATE POLICY "projects_delete_admin"
ON public.projects FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- project_members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pm_select_authenticated" ON public.project_members;
CREATE POLICY "pm_select_authenticated"
ON public.project_members FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "pm_insert_admin" ON public.project_members;
CREATE POLICY "pm_insert_admin"
ON public.project_members FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "pm_delete_admin" ON public.project_members;
CREATE POLICY "pm_delete_admin"
ON public.project_members FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','todo','in_progress','review','done')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  due_date date,
  position double precision NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tasks_project_id_idx ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON public.tasks(assignee_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(status);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select_authenticated" ON public.tasks;
CREATE POLICY "tasks_select_authenticated"
ON public.tasks FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "tasks_insert_admin" ON public.tasks;
CREATE POLICY "tasks_insert_admin"
ON public.tasks FOR INSERT
TO authenticated
WITH CHECK (public.is_admin() AND auth.uid() = created_by);

DROP POLICY IF EXISTS "tasks_update_admin" ON public.tasks;
CREATE POLICY "tasks_update_admin"
ON public.tasks FOR UPDATE
TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Staff: may update tasks but trigger restricts which columns can change.
DROP POLICY IF EXISTS "tasks_update_staff_limited" ON public.tasks;
CREATE POLICY "tasks_update_staff_limited"
ON public.tasks FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (NOT public.is_admin());

DROP POLICY IF EXISTS "tasks_delete_admin" ON public.tasks;
CREATE POLICY "tasks_delete_admin"
ON public.tasks FOR DELETE
TO authenticated
USING (public.is_admin());

-- Trigger: staff may only change status, progress, position (updated_at auto-set).
CREATE OR REPLACE FUNCTION public.enforce_staff_task_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin_user boolean;
BEGIN
  SELECT public.is_admin() INTO is_admin_user;
  IF NOT is_admin_user THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Staff may only update status, progress, position on tasks';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_enforce_staff_fields ON public.tasks;
CREATE TRIGGER tasks_enforce_staff_fields
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_task_fields();

-- ============================================================
-- comments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comments_task_id_idx ON public.comments(task_id);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_authenticated" ON public.comments;
CREATE POLICY "comments_select_authenticated"
ON public.comments FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "comments_insert_self" ON public.comments;
CREATE POLICY "comments_insert_self"
ON public.comments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_delete_self_or_admin" ON public.comments;
CREATE POLICY "comments_delete_self_or_admin"
ON public.comments FOR DELETE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin());

-- ============================================================
-- time_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.time_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  source text NOT NULL DEFAULT 'timer' CHECK (source IN ('timer','auto','manual','agent')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS time_logs_user_id_idx ON public.time_logs(user_id);
CREATE INDEX IF NOT EXISTS time_logs_started_at_idx ON public.time_logs(started_at);

ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tl_select_admin_all_self_staff" ON public.time_logs;
CREATE POLICY "tl_select_admin_all_self_staff"
ON public.time_logs FOR SELECT
TO authenticated
USING (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "tl_insert_self" ON public.time_logs;
CREATE POLICY "tl_insert_self"
ON public.time_logs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tl_update_self_or_admin" ON public.time_logs;
CREATE POLICY "tl_update_self_or_admin"
ON public.time_logs FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "tl_delete_admin" ON public.time_logs;
CREATE POLICY "tl_delete_admin"
ON public.time_logs FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  type text NOT NULL DEFAULT 'personal' CHECK (type IN ('company','personal')),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_start_at_idx ON public.events(start_at);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "events_select_authenticated" ON public.events;
CREATE POLICY "events_select_authenticated"
ON public.events FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "events_insert_personal_or_admin_company" ON public.events;
CREATE POLICY "events_insert_personal_or_admin_company"
ON public.events FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND (type = 'personal' OR (type = 'company' AND public.is_admin()))
);

DROP POLICY IF EXISTS "events_update_company_admin_personal_owner" ON public.events;
CREATE POLICY "events_update_company_admin_personal_owner"
ON public.events FOR UPDATE
TO authenticated
USING (
  (type = 'company' AND public.is_admin())
  OR (type = 'personal' AND owner_id = auth.uid())
)
WITH CHECK (
  (type = 'company' AND public.is_admin())
  OR (type = 'personal' AND owner_id = auth.uid())
);

DROP POLICY IF EXISTS "events_delete_company_admin_personal_owner" ON public.events;
CREATE POLICY "events_delete_company_admin_personal_owner"
ON public.events FOR DELETE
TO authenticated
USING (
  (type = 'company' AND public.is_admin())
  OR (type = 'personal' AND owner_id = auth.uid())
);

-- ============================================================
-- sticky_notes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sticky_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'graphite' CHECK (color IN ('graphite','ash','slate','onyx','pearl')),
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  z integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sticky_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sn_select_authenticated" ON public.sticky_notes;
CREATE POLICY "sn_select_authenticated"
ON public.sticky_notes FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "sn_insert_self" ON public.sticky_notes;
CREATE POLICY "sn_insert_self"
ON public.sticky_notes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "sn_update_author_or_admin" ON public.sticky_notes;
CREATE POLICY "sn_update_author_or_admin"
ON public.sticky_notes FOR UPDATE
TO authenticated
USING (auth.uid() = author_id OR public.is_admin())
WITH CHECK (auth.uid() = author_id OR public.is_admin());

DROP POLICY IF EXISTS "sn_delete_author_or_admin" ON public.sticky_notes;
CREATE POLICY "sn_delete_author_or_admin"
ON public.sticky_notes FOR DELETE
TO authenticated
USING (auth.uid() = author_id OR public.is_admin());

-- ============================================================
-- settings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select_authenticated" ON public.settings;
CREATE POLICY "settings_select_authenticated"
ON public.settings FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_insert_admin" ON public.settings;
CREATE POLICY "settings_insert_admin"
ON public.settings FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "settings_update_admin" ON public.settings;
CREATE POLICY "settings_update_admin"
ON public.settings FOR UPDATE
TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "settings_delete_admin" ON public.settings;
CREATE POLICY "settings_delete_admin"
ON public.settings FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- app_categories
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_categories (
  pattern text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('work','neutral','distraction')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ac_select_authenticated" ON public.app_categories;
CREATE POLICY "ac_select_authenticated"
ON public.app_categories FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "ac_insert_admin" ON public.app_categories;
CREATE POLICY "ac_insert_admin"
ON public.app_categories FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ac_delete_admin" ON public.app_categories;
CREATE POLICY "ac_delete_admin"
ON public.app_categories FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- agent_devices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agent_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name text NOT NULL,
  os text NOT NULL DEFAULT '',
  agent_version text,
  last_seen timestamptz NOT NULL DEFAULT now(),
  is_tracking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ad_select_admin_self_staff" ON public.agent_devices;
CREATE POLICY "ad_select_admin_self_staff"
ON public.agent_devices FOR SELECT
TO authenticated
USING (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "ad_insert_self" ON public.agent_devices;
CREATE POLICY "ad_insert_self"
ON public.agent_devices FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ad_update_self_or_admin" ON public.agent_devices;
CREATE POLICY "ad_update_self_or_admin"
ON public.agent_devices FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "ad_delete_admin" ON public.agent_devices;
CREATE POLICY "ad_delete_admin"
ON public.agent_devices FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- app_usage
-- ============================================================
CREATE TABLE IF NOT EXISTS public.app_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.agent_devices(id) ON DELETE SET NULL,
  app_name text NOT NULL,
  window_title text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'neutral' CHECK (category IN ('work','neutral','distraction')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer,
  source text NOT NULL DEFAULT 'agent' CHECK (source IN ('auto','agent')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_usage_user_id_idx ON public.app_usage(user_id);
CREATE INDEX IF NOT EXISTS app_usage_started_at_idx ON public.app_usage(started_at);

ALTER TABLE public.app_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "au_select_admin_self_staff" ON public.app_usage;
CREATE POLICY "au_select_admin_self_staff"
ON public.app_usage FOR SELECT
TO authenticated
USING (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "au_insert_self" ON public.app_usage;
CREATE POLICY "au_insert_self"
ON public.app_usage FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "au_update_self_or_admin" ON public.app_usage;
CREATE POLICY "au_update_self_or_admin"
ON public.app_usage FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.is_admin())
WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "au_delete_admin" ON public.app_usage;
CREATE POLICY "au_delete_admin"
ON public.app_usage FOR DELETE
TO authenticated
USING (public.is_admin());

-- ============================================================
-- sessions_activity (rollups — service role writes only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.sessions_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL DEFAULT CURRENT_DATE,
  focus_seconds integer NOT NULL DEFAULT 0,
  idle_seconds integer NOT NULL DEFAULT 0,
  distraction_seconds integer NOT NULL DEFAULT 0,
  productivity_score numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS sa_user_date_idx ON public.sessions_activity(user_id, activity_date);

ALTER TABLE public.sessions_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sa_select_admin_self_staff" ON public.sessions_activity;
CREATE POLICY "sa_select_admin_self_staff"
ON public.sessions_activity FOR SELECT
TO authenticated
USING (public.is_admin() OR user_id = auth.uid());

-- ============================================================
-- activity_logs (audit — service role writes only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS al_created_at_idx ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS al_user_id_idx ON public.activity_logs(user_id);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "al_select_admin_self_staff" ON public.activity_logs;
CREATE POLICY "al_select_admin_self_staff"
ON public.activity_logs FOR SELECT
TO authenticated
USING (public.is_admin() OR user_id = auth.uid());

-- ============================================================
-- presence (blackboard live viewers)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  avatar_url text,
  last_seen timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pr_select_authenticated" ON public.presence;
CREATE POLICY "pr_select_authenticated"
ON public.presence FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "pr_insert_self" ON public.presence;
CREATE POLICY "pr_insert_self"
ON public.presence FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pr_update_self" ON public.presence;
CREATE POLICY "pr_update_self"
ON public.presence FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pr_delete_self" ON public.presence;
CREATE POLICY "pr_delete_self"
ON public.presence FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS projects_touch ON public.projects;
CREATE TRIGGER projects_touch BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS sticky_notes_touch ON public.sticky_notes;
CREATE TRIGGER sticky_notes_touch BEFORE UPDATE ON public.sticky_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- Seed default settings
-- ============================================================
INSERT INTO public.settings (key, value) VALUES
  ('workspace_name', '"District 7"'::jsonb),
  ('idle_timeout_seconds', '300'::jsonb),
  ('kanban_columns', '[{"id":"backlog","title":"Backlog"},{"id":"todo","title":"To Do"},{"id":"in_progress","title":"In Progress"},{"id":"review","title":"Review"},{"id":"done","title":"Done"}]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Seed default app categories
-- ============================================================
INSERT INTO public.app_categories (pattern, category) VALUES
  ('code','work'),('vscode','work'),('figma','work'),('notion','work'),('slack','work'),
  ('terminal','work'),('word','work'),('excel','work'),('outlook','work'),('district 7','work'),
  ('postman','work'),('intellij','work'),('xcode','work'),('git','work'),('docker','work'),
  ('chrome','neutral'),('safari','neutral'),('firefox','neutral'),('spotify','neutral'),('discord','neutral'),
  ('steam','distraction'),('csgo.exe','distraction'),('youtube','distraction'),('netflix','distraction'),
  ('twitch','distraction'),('twitter','distraction'),('instagram','distraction'),('facebook','distraction'),
  ('reddit','distraction'),('tiktok','distraction')
ON CONFLICT (pattern) DO NOTHING;
