CREATE POLICY "avatars_read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "screenshots_read_own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'screenshots' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "screenshots_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'screenshots' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "screenshots_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'screenshots' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(),'admin')));

CREATE POLICY "tournament_images_read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'tournament-images');
CREATE POLICY "tournament_images_admin_write" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'tournament-images' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'tournament-images' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "status_media_read" ON storage.objects FOR SELECT TO authenticated, anon USING (bucket_id = 'status-media');
CREATE POLICY "status_media_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'status-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "status_media_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'status-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "status_media_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'status-media' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "notifications_insert_auth" ON public.notifications;
CREATE POLICY "notifications_insert_own" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);