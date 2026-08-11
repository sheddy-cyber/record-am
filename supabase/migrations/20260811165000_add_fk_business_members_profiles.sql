ALTER TABLE business_members
ADD CONSTRAINT business_members_user_id_fkey_profile
FOREIGN KEY (user_id) REFERENCES user_profiles(id) ON DELETE CASCADE;
