CREATE OR REPLACE FUNCTION public.guard_profile_block_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
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

REVOKE ALL ON FUNCTION public.guard_profile_block_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_profile_block_fields() TO service_role;