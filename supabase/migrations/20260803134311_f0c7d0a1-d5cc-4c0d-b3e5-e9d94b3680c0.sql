REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_squad_invite_response() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_squad_invite() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_captain_as_member() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_squad_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_squad_captain(uuid, uuid) FROM anon;