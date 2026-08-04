-- 1. squads crest colour + invite role
ALTER TABLE public.squads ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '142 76% 45%';
ALTER TABLE public.squad_invites ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'player';

-- 2. officer helper
CREATE OR REPLACE FUNCTION public.is_squad_officer(_squad_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.squad_members
    WHERE squad_id = _squad_id AND user_id = _user_id AND role IN ('captain','co_captain')
  ) OR EXISTS (
    SELECT 1 FROM public.squads WHERE id = _squad_id AND captain_id = _user_id
  );
$$;
REVOKE EXECUTE ON FUNCTION public.is_squad_officer(uuid, uuid) FROM anon;

-- 3. squad messages
CREATE TABLE IF NOT EXISTS public.squad_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id uuid,
  username text NOT NULL DEFAULT 'GameFlex',
  avatar_url text,
  content text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_messages TO authenticated;
GRANT ALL ON public.squad_messages TO service_role;
ALTER TABLE public.squad_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY squad_messages_read_members ON public.squad_messages FOR SELECT TO authenticated
  USING (public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY squad_messages_insert_members ON public.squad_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY squad_messages_update_members ON public.squad_messages FOR UPDATE TO authenticated
  USING (public.is_squad_member(squad_id, auth.uid()))
  WITH CHECK (public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY squad_messages_delete_own ON public.squad_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_squad_officer(squad_id, auth.uid()));
CREATE INDEX IF NOT EXISTS squad_messages_squad_idx ON public.squad_messages(squad_id, created_at);

-- 4. squad events
CREATE TABLE IF NOT EXISTS public.squad_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  title text NOT NULL,
  game text,
  starts_at timestamptz NOT NULL,
  notes text,
  type text NOT NULL DEFAULT 'tournament',
  created_by uuid NOT NULL,
  rsvps jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_events TO authenticated;
GRANT ALL ON public.squad_events TO service_role;
ALTER TABLE public.squad_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY squad_events_read_members ON public.squad_events FOR SELECT TO authenticated
  USING (public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY squad_events_insert_members ON public.squad_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by AND public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY squad_events_update_members ON public.squad_events FOR UPDATE TO authenticated
  USING (public.is_squad_member(squad_id, auth.uid()))
  WITH CHECK (public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY squad_events_delete_officers ON public.squad_events FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_squad_officer(squad_id, auth.uid()));
CREATE INDEX IF NOT EXISTS squad_events_squad_idx ON public.squad_events(squad_id, starts_at);

-- 5. join requests
CREATE TABLE IF NOT EXISTS public.squad_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  responded_by uuid,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (squad_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_join_requests TO authenticated;
GRANT ALL ON public.squad_join_requests TO service_role;
ALTER TABLE public.squad_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY join_requests_read ON public.squad_join_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_squad_officer(squad_id, auth.uid()));
CREATE POLICY join_requests_insert_self ON public.squad_join_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY join_requests_update ON public.squad_join_requests FOR UPDATE TO authenticated
  USING (public.is_squad_officer(squad_id, auth.uid()))
  WITH CHECK (public.is_squad_officer(squad_id, auth.uid()));
CREATE POLICY join_requests_delete_own ON public.squad_join_requests FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_squad_officer(squad_id, auth.uid()));

-- 6. members may join a public squad only through an approved request/invite:
--    officers can add members, users may only insert themselves as captain of a squad they own
DROP POLICY IF EXISTS squad_members_join_self ON public.squad_members;
CREATE POLICY squad_members_managed ON public.squad_members FOR INSERT TO authenticated
  WITH CHECK (public.is_squad_officer(squad_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.squads s WHERE s.id = squad_id AND s.captain_id = auth.uid()));

-- 7. invite response honours the offered role + posts a system message
CREATE OR REPLACE FUNCTION public.handle_squad_invite_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE squad_name text; invitee_name text;
BEGIN
  IF NEW.status <> OLD.status AND NEW.status IN ('accepted','rejected') THEN
    NEW.responded_at = now();
    SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
    SELECT username INTO invitee_name FROM public.profiles WHERE user_id = NEW.invitee_id;
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.squad_members (squad_id, user_id, role)
      VALUES (NEW.squad_id, NEW.invitee_id, COALESCE(NEW.role,'player'))
      ON CONFLICT (squad_id, user_id) DO NOTHING;
      INSERT INTO public.squad_messages (squad_id, username, content, is_system)
      VALUES (NEW.squad_id, 'GameFlex',
        COALESCE(invitee_name,'A player') || ' joined the squad as ' || COALESCE(NEW.role,'player') || '.', true);
    END IF;
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (NEW.inviter_id, 'squad',
      CASE WHEN NEW.status = 'accepted' THEN 'Squad invite accepted' ELSE 'Squad invite declined' END,
      COALESCE(squad_name,'Your squad') || ': invite was ' || NEW.status, '/teams');
  END IF;
  RETURN NEW;
END; $function$;

-- 8. new squad -> welcome message
CREATE OR REPLACE FUNCTION public.handle_new_squad_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.squad_messages (squad_id, username, content, is_system, pinned)
  VALUES (NEW.id, 'GameFlex', NEW.name || ' was created. Invite your squadmates and lock in your first tournament.', true, true);
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_squad_message() FROM anon, authenticated;
DROP TRIGGER IF EXISTS squads_welcome_message ON public.squads;
CREATE TRIGGER squads_welcome_message AFTER INSERT ON public.squads
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_squad_message();

-- 9. join request notifications + approval side effects
CREATE OR REPLACE FUNCTION public.notify_join_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE squad_name text; requester text; officer record;
BEGIN
  SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
  SELECT username INTO requester FROM public.profiles WHERE user_id = NEW.user_id;
  FOR officer IN SELECT user_id FROM public.squad_members
    WHERE squad_id = NEW.squad_id AND role IN ('captain','co_captain')
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (officer.user_id, 'squad', 'New join request',
      COALESCE(requester,'A player') || ' wants to join ' || COALESCE(squad_name,'your squad') || '.',
      '/teams/' || NEW.squad_id);
  END LOOP;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_join_request() FROM anon, authenticated;
DROP TRIGGER IF EXISTS squad_join_request_created ON public.squad_join_requests;
CREATE TRIGGER squad_join_request_created AFTER INSERT ON public.squad_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_join_request();

CREATE OR REPLACE FUNCTION public.handle_join_request_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE squad_name text; requester text;
BEGIN
  IF NEW.status <> OLD.status AND NEW.status IN ('approved','rejected') THEN
    NEW.responded_at = now();
    SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
    SELECT username INTO requester FROM public.profiles WHERE user_id = NEW.user_id;
    IF NEW.status = 'approved' THEN
      INSERT INTO public.squad_members (squad_id, user_id, role)
      VALUES (NEW.squad_id, NEW.user_id, 'player') ON CONFLICT (squad_id, user_id) DO NOTHING;
      INSERT INTO public.squad_messages (squad_id, username, content, is_system)
      VALUES (NEW.squad_id, 'GameFlex', COALESCE(requester,'A player') || ' joined the squad.', true);
    END IF;
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (NEW.user_id, 'squad',
      CASE WHEN NEW.status = 'approved' THEN 'Join request approved' ELSE 'Join request declined' END,
      COALESCE(squad_name,'The squad') || ': your request was ' || NEW.status || '.',
      CASE WHEN NEW.status = 'approved' THEN '/teams/' || NEW.squad_id ELSE '/teams' END);
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.handle_join_request_response() FROM anon, authenticated;
DROP TRIGGER IF EXISTS squad_join_request_response ON public.squad_join_requests;
CREATE TRIGGER squad_join_request_response BEFORE UPDATE ON public.squad_join_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_join_request_response();

-- 10. invite notification should deep-link to squads page
CREATE OR REPLACE FUNCTION public.notify_squad_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE squad_name text;
BEGIN
  SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
  INSERT INTO public.notifications (user_id, type, title, message, action_url)
  VALUES (NEW.invitee_id, 'squad', 'Squad invite',
    'You have been invited to join ' || COALESCE(squad_name,'a squad'), '/teams');
  RETURN NEW;
END; $$;