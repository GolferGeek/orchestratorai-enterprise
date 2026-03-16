-- Add visibility settings to teams
ALTER TABLE public.teams 
ADD COLUMN is_public boolean NOT NULL DEFAULT true,
ADD COLUMN join_passcode text DEFAULT NULL;

-- Allow users to view public teams (for browsing/joining)
CREATE POLICY "Anyone can view public teams"
ON public.teams
FOR SELECT
USING (is_public = true);
