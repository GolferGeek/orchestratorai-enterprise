-- Create profiles table for storing display names
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles are viewable by everyone (for seeing who tasks are assigned to)
CREATE POLICY "Profiles are viewable by everyone"
ON public.profiles
FOR SELECT
USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
ON public.profiles
FOR INSERT
WITH CHECK (auth.uid() = id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, COALESCE(new.raw_user_meta_data ->> 'display_name', new.email));
  RETURN new;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add user_id column to tasks to link to authenticated user
ALTER TABLE public.tasks ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Update tasks RLS policies to be more specific
DROP POLICY IF EXISTS "Anyone can delete tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can insert tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Anyone can update tasks" ON public.tasks;

-- Everyone can read tasks (shared team view)
CREATE POLICY "Everyone can read tasks"
ON public.tasks
FOR SELECT
USING (true);

-- Authenticated users can insert tasks
CREATE POLICY "Authenticated users can insert tasks"
ON public.tasks
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Authenticated users can update any task (team collaboration)
CREATE POLICY "Authenticated users can update tasks"
ON public.tasks
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Authenticated users can delete any task (team collaboration)
CREATE POLICY "Authenticated users can delete tasks"
ON public.tasks
FOR DELETE
USING (auth.uid() IS NOT NULL);