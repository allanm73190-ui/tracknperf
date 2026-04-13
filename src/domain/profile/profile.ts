export type ProfileId = string;

export type ProfileRow = {
  id: ProfileId;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveProfileInput = {
  userId: ProfileId;
  email?: string | null;
  displayName: string;
  avatarUrl?: string | null;
};

