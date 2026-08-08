// @ts-nocheck
import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy path — Reels is now called Flex. Keep old links working.
export const Route = createFileRoute("/reels")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/flex", search, replace: true });
  },
});
