// @ts-nocheck
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { achievementsService } from "@/services/achievements/AchievementsService";
import { useToast } from "@/hooks/use-toast";

/**
 * Evaluates the signed-in user's progress and unlocks any achievement whose
 * requirement is already met. Runs once per session (and whenever the user
 * changes) so achievements never sit locked after the milestone is reached.
 */
export function useAchievementAutoUnlock() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id || ranFor.current === user.id) return;
    ranFor.current = user.id;
    let cancelled = false;

    (async () => {
      try {
        const [stats, profile, referrals, posts, squads] = await Promise.all([
          supabase
            .from("leaderboard_stats")
            .select("wins, points, earnings, tournaments_played")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("profiles")
            .select("followers_count, avatar_url, bio, game_handle, username")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("referrals")
            .select("id", { count: "exact", head: true })
            .eq("referrer_id", user.id),
          supabase
            .from("user_statuses")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
          supabase
            .from("squad_members")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id),
        ]);

        const p = profile.data ?? {};
        const s = stats.data ?? {};
        const profileComplete =
          !!p.avatar_url && !!p.bio && !!p.game_handle && !!p.username ? 1 : 0;

        const progress: Record<string, number> = {
          wins: Number(s.wins ?? 0),
          points: Number(s.points ?? 0),
          earnings: Number(s.earnings ?? 0),
          tournaments_played: Number(s.tournaments_played ?? 0),
          followers: Number(p.followers_count ?? 0),
          referrals: referrals.count ?? 0,
          posts: posts.count ?? 0,
          squads: squads.count ?? 0,
          profile_complete: profileComplete,
        };

        const unlocked = [];
        for (const [type, value] of Object.entries(progress)) {
          if (value <= 0) continue;
          const newly = await achievementsService.checkAndUnlock(user.id, type, value);
          unlocked.push(...newly);
        }

        if (cancelled || unlocked.length === 0) return;

        queryClient.invalidateQueries({ queryKey: ["achievements"] });
        toast({
          title:
            unlocked.length === 1
              ? `Achievement unlocked: ${unlocked[0].name}`
              : `${unlocked.length} achievements unlocked!`,
          description:
            unlocked.length === 1
              ? unlocked[0].description
              : unlocked.map((a) => a.name).join(", "),
        });
      } catch {
        /* achievement unlocking is best-effort and must never break the app */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, queryClient, toast]);
}
