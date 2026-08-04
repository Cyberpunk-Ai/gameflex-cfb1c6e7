CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL,
  referred_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  bonus_claimed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "referrals_own" ON public.referrals FOR ALL TO authenticated USING (auth.uid() IN (referrer_id, referred_id)) WITH CHECK (auth.uid() IN (referrer_id, referred_id));

CREATE TABLE public.rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  type public.reward_type NOT NULL,
  amount numeric NOT NULL,
  description text,
  status text DEFAULT 'pending',
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rewards TO authenticated;
GRANT ALL ON public.rewards TO service_role;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rewards_own" ON public.rewards FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  activity_type text NOT NULL,
  title text NOT NULL,
  description text,
  metadata jsonb,
  is_public boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_feed TO authenticated;
GRANT SELECT ON public.activity_feed TO anon;
GRANT ALL ON public.activity_feed TO service_role;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_public_read" ON public.activity_feed FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "activity_insert_own" ON public.activity_feed FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  status text DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_own" ON public.whatsapp_messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tag text,
  description text,
  logo_url text,
  game public.game_type,
  captain_id uuid NOT NULL,
  max_members integer NOT NULL DEFAULT 6,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squads TO authenticated;
GRANT SELECT ON public.squads TO anon;
GRANT ALL ON public.squads TO service_role;
ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER squads_updated_at BEFORE UPDATE ON public.squads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (squad_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_members TO authenticated;
GRANT SELECT ON public.squad_members TO anon;
GRANT ALL ON public.squad_members TO service_role;
ALTER TABLE public.squad_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_squad_member(_squad_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.squad_members WHERE squad_id = _squad_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_squad_captain(_squad_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.squads WHERE id = _squad_id AND captain_id = _user_id);
$$;

CREATE POLICY "squads_read" ON public.squads FOR SELECT USING (is_public = true OR public.is_squad_member(id, auth.uid()));
CREATE POLICY "squads_insert_captain" ON public.squads FOR INSERT TO authenticated WITH CHECK (auth.uid() = captain_id);
CREATE POLICY "squads_update_captain" ON public.squads FOR UPDATE TO authenticated USING (auth.uid() = captain_id);
CREATE POLICY "squads_delete_captain" ON public.squads FOR DELETE TO authenticated USING (auth.uid() = captain_id);

CREATE POLICY "squad_members_read" ON public.squad_members FOR SELECT USING (true);
CREATE POLICY "squad_members_join_self" ON public.squad_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR public.is_squad_captain(squad_id, auth.uid()));
CREATE POLICY "squad_members_leave" ON public.squad_members FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_squad_captain(squad_id, auth.uid()));
CREATE POLICY "squad_members_update_captain" ON public.squad_members FOR UPDATE TO authenticated USING (public.is_squad_captain(squad_id, auth.uid()));

CREATE TABLE public.squad_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  message text,
  status public.squad_invite_status NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX squad_invites_unique_pending ON public.squad_invites (squad_id, invitee_id) WHERE status = 'pending';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.squad_invites TO authenticated;
GRANT ALL ON public.squad_invites TO service_role;
ALTER TABLE public.squad_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites_read_involved" ON public.squad_invites FOR SELECT TO authenticated
USING (auth.uid() = invitee_id OR auth.uid() = inviter_id OR public.is_squad_captain(squad_id, auth.uid()));
CREATE POLICY "invites_create_captain" ON public.squad_invites FOR INSERT TO authenticated
WITH CHECK (auth.uid() = inviter_id AND public.is_squad_member(squad_id, auth.uid()));
CREATE POLICY "invites_respond_invitee" ON public.squad_invites FOR UPDATE TO authenticated
USING (auth.uid() = invitee_id OR auth.uid() = inviter_id) WITH CHECK (auth.uid() = invitee_id OR auth.uid() = inviter_id);
CREATE POLICY "invites_delete_inviter" ON public.squad_invites FOR DELETE TO authenticated USING (auth.uid() = inviter_id);
CREATE TRIGGER squad_invites_updated_at BEFORE UPDATE ON public.squad_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_squad_invite_response()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE squad_name text;
BEGIN
  IF NEW.status <> OLD.status AND NEW.status IN ('accepted','rejected') THEN
    NEW.responded_at = now();
    SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.squad_members (squad_id, user_id, role) VALUES (NEW.squad_id, NEW.invitee_id, 'member')
      ON CONFLICT (squad_id, user_id) DO NOTHING;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, message, action_url)
    VALUES (NEW.inviter_id, 'squad',
      CASE WHEN NEW.status = 'accepted' THEN 'Squad invite accepted' ELSE 'Squad invite declined' END,
      COALESCE(squad_name,'Your squad') || ': invite was ' || NEW.status, '/squads');
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER squad_invite_response BEFORE UPDATE ON public.squad_invites FOR EACH ROW EXECUTE FUNCTION public.handle_squad_invite_response();

CREATE OR REPLACE FUNCTION public.notify_squad_invite()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE squad_name text;
BEGIN
  SELECT name INTO squad_name FROM public.squads WHERE id = NEW.squad_id;
  INSERT INTO public.notifications (user_id, type, title, message, action_url)
  VALUES (NEW.invitee_id, 'squad', 'Squad invite',
    'You have been invited to join ' || COALESCE(squad_name,'a squad'), '/squads');
  RETURN NEW;
END; $$;
CREATE TRIGGER squad_invite_created AFTER INSERT ON public.squad_invites FOR EACH ROW EXECUTE FUNCTION public.notify_squad_invite();

CREATE OR REPLACE FUNCTION public.add_captain_as_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.squad_members (squad_id, user_id, role) VALUES (NEW.id, NEW.captain_id, 'captain')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER squads_add_captain AFTER INSERT ON public.squads FOR EACH ROW EXECUTE FUNCTION public.add_captain_as_member();

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  event_name text NOT NULL,
  properties jsonb,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT INSERT ON public.analytics_events TO authenticated, anon;
GRANT SELECT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics_insert_any" ON public.analytics_events FOR INSERT WITH CHECK (true);
CREATE POLICY "analytics_admin_read" ON public.analytics_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['activity_feed','conversations','leaderboard_stats','matches','messages','registrations','rewards','status_comments','status_likes','tournaments','user_follows','user_statuses','payments','squad_invites','squad_members','notifications']
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;