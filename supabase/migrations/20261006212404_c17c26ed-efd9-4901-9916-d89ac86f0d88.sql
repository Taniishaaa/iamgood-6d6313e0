ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.guard_profile_block_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'Only an administrator can change account access';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_block_fields ON public.profiles;
CREATE TRIGGER guard_profile_block_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_block_fields();