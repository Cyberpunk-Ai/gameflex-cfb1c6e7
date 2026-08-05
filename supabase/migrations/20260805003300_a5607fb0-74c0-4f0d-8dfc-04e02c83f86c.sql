CREATE POLICY "marketplace_images_insert_auth" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tournament-images' AND (storage.foldername(name))[1] = 'marketplace');
CREATE POLICY "marketplace_images_delete_owner" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tournament-images' AND (storage.foldername(name))[1] = 'marketplace' AND owner_id = auth.uid()::text);