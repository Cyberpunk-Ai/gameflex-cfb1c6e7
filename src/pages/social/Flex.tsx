// @ts-nocheck
import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Link } from "@/lib/router-compat";
import { recommendationService } from "@/services/recommendations/RecommendationService";
import { recommendationEventService } from "@/services/recommendations/RecommendationEventService";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Heart,
  MessageCircle,
  Share2,
  Bookmark,
  MoreVertical,
  Film,
  Volume2,
  VolumeX,
  Music,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

export default function Flex() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [muted, setMuted] = useState(true);
  const [showMuteIcon, setShowMuteIcon] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string>>(new Set());

  const { data: clips = [], isLoading } = useQuery({
    queryKey: ["flex-clips", user?.id],
    queryFn: async () => {
      const attachProfiles = async (rows: any[]) => {
        if (!rows?.length) return [];
        const ids = [...new Set(rows.map((s: any) => s.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, username, avatar_url")
          .in("user_id", ids);
        const map = new Map(profiles?.map((p: any) => [p.user_id, p]) ?? []);
        return rows.map((r: any) => ({ ...r, profile: map.get(r.user_id) }));
      };

      try {
        const { items } = await recommendationService.fetchRecommendations("reels", user?.id, 50);
        const rows = items.map((item: any) => item.payload).filter(Boolean);
        if (rows.length) return attachProfiles(rows);
      } catch {
        /* fall through to direct query */
      }

      const { data } = await supabase
        .from("user_statuses")
        .select("*")
        .eq("media_type", "video")
        .order("created_at", { ascending: false })
        .limit(50);
      return attachProfiles(data ?? []);
    },
  });

  // Deep link support: /flex?id=<clipId> scrolls to that clip.
  useEffect(() => {
    if (!clips.length || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    const el = document.querySelector(`[data-clip-id="${id}"]`);
    el?.scrollIntoView({ behavior: "auto" });
  }, [clips.length]);

  // My interactions (likes / saves / follows) so the UI reflects real state.
  const { data: interactions } = useQuery({
    queryKey: ["flex-interactions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [likes, saves, follows] = await Promise.all([
        supabase.from("status_likes").select("status_id").eq("user_id", user!.id),
        supabase.from("status_saves").select("status_id").eq("user_id", user!.id),
        supabase.from("user_follows").select("following_id").eq("follower_id", user!.id),
      ]);
      return {
        liked: new Set((likes.data ?? []).map((r: any) => r.status_id)),
        saved: new Set((saves.data ?? []).map((r: any) => r.status_id)),
        following: new Set((follows.data ?? []).map((r: any) => r.following_id)),
      };
    },
  });

  const liked = interactions?.liked ?? new Set<string>();
  const saved = interactions?.saved ?? new Set<string>();
  const following = interactions?.following ?? new Set<string>();

  const invalidateInteractions = () =>
    queryClient.invalidateQueries({ queryKey: ["flex-interactions", user?.id] });

  const { data: comments = [] } = useQuery({
    queryKey: ["flex-comments", selectedClipId],
    enabled: !!selectedClipId && commentsOpen,
    queryFn: async () => {
      const { data: commentsData } = await supabase
        .from("status_comments")
        .select("*")
        .eq("status_id", selectedClipId!)
        .order("created_at", { ascending: true });
      if (!commentsData?.length) return [];
      const userIds = [...new Set(commentsData.map((c: any) => c.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, username, avatar_url")
        .in("user_id", userIds);
      const profileMap = new Map(profiles?.map((p: any) => [p.user_id, p]) ?? []);
      return commentsData.map((c: any) => ({ ...c, profile: profileMap.get(c.user_id) }));
    },
  });

  const likeMutation = useMutation({
    mutationFn: async ({ clipId, isLiked }: { clipId: string; isLiked: boolean }) => {
      if (!user) throw new Error("Sign in required");
      if (isLiked) {
        const { error } = await supabase
          .from("status_likes")
          .delete()
          .eq("status_id", clipId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("status_likes")
          .insert({ status_id: clipId, user_id: user.id });
        if (error) throw error;
        void recommendationEventService.recordEvent({
          userId: user.id,
          entityType: "reel",
          entityId: clipId,
          action: "like",
        });
      }
    },
    onSuccess: invalidateInteractions,
    onError: (e: any) => toast({ title: "Couldn't update like", description: e.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async ({ clipId, isSaved }: { clipId: string; isSaved: boolean }) => {
      if (!user) throw new Error("Sign in required");
      if (isSaved) {
        const { error } = await supabase
          .from("status_saves")
          .delete()
          .eq("status_id", clipId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("status_saves")
          .insert({ status_id: clipId, user_id: user.id });
        if (error) throw error;
        void recommendationEventService.recordEvent({
          userId: user.id,
          entityType: "reel",
          entityId: clipId,
          action: "save",
        });
      }
    },
    onSuccess: (_d, { isSaved }) => {
      invalidateInteractions();
      queryClient.invalidateQueries({ queryKey: ["saved"] });
      toast({ title: isSaved ? "Removed from saved" : "Saved to your collection" });
    },
    onError: (e: any) => toast({ title: "Couldn't save clip", description: e.message, variant: "destructive" }),
  });

  const commentMutation = useMutation({
    mutationFn: async ({ clipId, content }: { clipId: string; content: string }) => {
      if (!user) throw new Error("Sign in required");
      const { error } = await supabase
        .from("status_comments")
        .insert({ status_id: clipId, user_id: user.id, content });
      if (error) throw error;
      void recommendationEventService.recordEvent({
        userId: user.id,
        entityType: "reel",
        entityId: clipId,
        action: "comment",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flex-comments", selectedClipId] });
      queryClient.invalidateQueries({ queryKey: ["flex-clips"] });
      setCommentText("");
    },
    onError: (e: any) => toast({ title: "Couldn't post comment", description: e.message, variant: "destructive" }),
  });

  const followMutation = useMutation({
    mutationFn: async ({
      targetUserId,
      isFollowing,
    }: {
      targetUserId: string;
      isFollowing: boolean;
    }) => {
      if (!user) throw new Error("Sign in required");
      if (user.id === targetUserId) throw new Error("You can't follow yourself");
      if (isFollowing) {
        const { error } = await supabase
          .from("user_follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", targetUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_follows")
          .insert({ follower_id: user.id, following_id: targetUserId });
        if (error) throw error;
      }
    },
    onSuccess: (_d, { isFollowing }) => {
      invalidateInteractions();
      toast({ title: isFollowing ? "Unfollowed" : "Following" });
    },
    onError: (e: any) => toast({ title: "Couldn't update follow", description: e.message, variant: "destructive" }),
  });

  // Autoplay the in-view clip and record a view once per session.
  useEffect(() => {
    if (!clips.length) return;
    const videos = Array.from(document.querySelectorAll("[data-clip-video]"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.7) {
            video.play().catch(() => {});
            const id = video.getAttribute("data-clip-id");
            if (id && !seenRef.current.has(id)) {
              seenRef.current.add(id);
              void recommendationEventService.recordEvent({
                userId: user?.id ?? null,
                entityType: "reel",
                entityId: id,
                action: "view",
              });
            }
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.7, 1] },
    );
    videos.forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, [clips, user?.id]);

  const handleVideoClick = () => {
    setMuted((prev) => !prev);
    setShowMuteIcon(true);
    setTimeout(() => setShowMuteIcon(false), 800);
  };

  const requireAuth = (message: string) => {
    if (user) return true;
    toast({ title: message, variant: "destructive" });
    return false;
  };

  const handleShare = async (clipId: string) => {
    const url = `${window.location.origin}/flex?id=${clipId}`;
    void recommendationEventService.recordEvent({
      userId: user?.id ?? null,
      entityType: "reel",
      entityId: clipId,
      action: "share",
    });
    if (navigator.share) {
      try {
        await navigator.share({ title: "Check out this clip on GameFlex", url });
        return;
      } catch {
        /* cancelled — fall back to clipboard */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied", description: "Share this Flex clip with your friends" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const emptyState = useMemo(
    () => (
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-background text-muted-foreground px-6 text-center">
        <div className="rounded-full bg-muted/40 p-6 mb-4">
          <Film className="h-14 w-14 opacity-50" />
        </div>
        <p className="font-semibold text-lg text-foreground">No Flex clips yet</p>
        <p className="text-sm mt-1">Post a video clip and it will show up here</p>
        <Button asChild className="mt-5 rounded-full px-6 font-semibold">
          <Link to="/create">Create a clip</Link>
        </Button>
      </div>
    ),
    [],
  );

  if (isLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-full max-w-sm aspect-[9/16] rounded-2xl bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!clips.length) return emptyState;

  return (
    <>
      <div
        ref={containerRef}
        className="h-[100dvh] overflow-y-scroll overscroll-contain snap-y snap-mandatory bg-background scrollbar-hide"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {clips.map((clip: any) => {
          const isLiked = liked.has(clip.id);
          const isSaved = saved.has(clip.id);
          const isFollowing = following.has(clip.user_id);
          return (
            <div
              key={clip.id}
              data-clip-id={clip.id}
              className="h-[100dvh] w-full relative snap-start snap-always flex items-center justify-center bg-black md:bg-background md:py-4"
            >
              <div className="relative w-full h-full md:max-w-sm md:h-auto md:aspect-[9/16] md:mx-auto md:rounded-2xl md:overflow-hidden md:shadow-2xl md:border md:border-border/50">
                <video
                  data-clip-video
                  data-clip-id={clip.id}
                  src={clip.media_url}
                  loop
                  muted={muted}
                  playsInline
                  preload="metadata"
                  className="absolute inset-0 w-full h-full object-cover"
                  onClick={handleVideoClick}
                />

                <AnimatePresence>
                  {showMuteIcon && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                    >
                      {muted ? (
                        <VolumeX className="h-16 w-16 text-white drop-shadow-2xl" />
                      ) : (
                        <Volume2 className="h-16 w-16 text-white drop-shadow-2xl" />
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bottom overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
                  <div className="flex items-center gap-3 mb-3 min-w-0">
                    <Link to={`/player/${clip.user_id}`} className="shrink-0">
                      <Avatar className="h-10 w-10 border-2 border-white">
                        <AvatarImage src={clip.profile?.avatar_url} />
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {clip.profile?.username?.[0]?.toUpperCase() ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/player/${clip.user_id}`}
                        className="font-bold text-white text-sm block truncate"
                      >
                        {clip.profile?.username ?? "Unknown"}
                      </Link>
                    </div>
                    {user && user.id !== clip.user_id && (
                      <Button
                        size="sm"
                        variant={isFollowing ? "outline" : "default"}
                        className="h-8 px-4 rounded-full font-semibold shrink-0"
                        disabled={followMutation.isPending}
                        onClick={() =>
                          followMutation.mutate({ targetUserId: clip.user_id, isFollowing })
                        }
                      >
                        {isFollowing ? "Following" : "Follow"}
                      </Button>
                    )}
                  </div>

                  {clip.content && (
                    <p className="text-white text-sm mb-2 line-clamp-2 leading-relaxed">
                      {clip.content}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-white/90 text-xs">
                    <Music className="h-3 w-3 shrink-0" />
                    <span className="truncate">Original Audio</span>
                  </div>
                </div>

                {/* Right controls */}
                <div className="absolute right-2 md:right-4 bottom-24 md:bottom-1/2 md:translate-y-1/2 flex flex-col gap-4 z-10">
                  <button
                    aria-label={isLiked ? "Unlike clip" : "Like clip"}
                    onClick={() => {
                      if (!requireAuth("Sign in to like")) return;
                      likeMutation.mutate({ clipId: clip.id, isLiked });
                    }}
                    className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                      <Heart
                        className={cn("h-6 w-6", isLiked && "fill-destructive text-destructive")}
                      />
                    </div>
                    <span className="text-xs font-semibold drop-shadow-lg">
                      {(clip.likes_count ?? 0) + (isLiked ? 1 : 0)}
                    </span>
                  </button>

                  <button
                    aria-label="View comments"
                    onClick={() => {
                      setSelectedClipId(clip.id);
                      setCommentsOpen(true);
                    }}
                    className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                      <MessageCircle className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-semibold drop-shadow-lg">
                      {clip.comments_count ?? 0}
                    </span>
                  </button>

                  <button
                    aria-label="Share clip"
                    onClick={() => handleShare(clip.id)}
                    className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                      <Share2 className="h-6 w-6" />
                    </div>
                  </button>

                  <button
                    aria-label={isSaved ? "Remove from saved" : "Save clip"}
                    onClick={() => {
                      if (!requireAuth("Sign in to save")) return;
                      saveMutation.mutate({ clipId: clip.id, isSaved });
                    }}
                    className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                  >
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                      <Bookmark className={cn("h-6 w-6", isSaved && "fill-white")} />
                    </div>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="More options"
                        className="flex flex-col items-center gap-1 text-white active:scale-95 transition-transform"
                      >
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                          <MoreVertical className="h-6 w-6" />
                        </div>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border/60 w-48">
                      <DropdownMenuItem asChild>
                        <Link to={`/report?id=${clip.id}`}>Report</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          void recommendationEventService.recordEvent({
                            userId: user?.id ?? null,
                            entityType: "reel",
                            entityId: clip.id,
                            action: "hide",
                          });
                          toast({
                            title: "Not interested",
                            description: "We'll show you less like this",
                          });
                        }}
                      >
                        Not interested
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleShare(clip.id)}>
                        Copy link
                      </DropdownMenuItem>
                      {clip.media_url && (
                        <DropdownMenuItem onClick={() => window.open(clip.media_url, "_blank")}>
                          Download
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Comments drawer */}
      <Drawer open={commentsOpen} onOpenChange={setCommentsOpen}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader className="border-b border-border/50">
            <DrawerTitle>Comments</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {comments.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                No comments yet. Be the first!
              </p>
            ) : (
              comments.map((comment: any) => (
                <div key={comment.id} className="flex gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={comment.profile?.avatar_url} />
                    <AvatarFallback>{comment.profile?.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1 min-w-0">
                      <span className="font-semibold text-sm truncate">
                        {comment.profile?.username ?? "User"}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(comment.created_at))} ago
                      </span>
                    </div>
                    <p className="text-sm break-words">{comment.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border/50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {user ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (commentText.trim() && selectedClipId) {
                    commentMutation.mutate({ clipId: selectedClipId, content: commentText.trim() });
                  }
                }}
                className="flex gap-2"
              >
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                  className="resize-none min-h-[44px] flex-1"
                  rows={1}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Post comment"
                  disabled={!commentText.trim() || commentMutation.isPending}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <Button asChild className="w-full rounded-xl font-semibold">
                <Link to="/auth">Sign in to comment</Link>
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
