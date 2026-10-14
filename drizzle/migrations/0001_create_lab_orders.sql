-- Create lab_orders table to track diagnostic tests via Orange Health Labs
CREATE TABLE IF NOT EXISTS public.lab_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  orange_order_id text,
  city_request_id text,
  patient_name text NOT NULL,
  patient_phone text NOT NULL,
  patient_age integer,
  patient_gender text,
  address text NOT NULL,
  latitude double precision,
  longitude double precision,
  slot_datetime timestamptz,
  tests jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'requested',
  payment_status text NOT NULL DEFAULT 'pending',
  total_price numeric(10, 2) DEFAULT 0,
  notes text,
  report_url text,
  report_data jsonb DEFAULT NULL,
  raw_response jsonb DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Grants (required for Data API access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lab_orders TO authenticated;
GRANT ALL ON public.lab_orders TO service_role;

-- Enable RLS
ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;

-- Policies for users and guardians
CREATE POLICY "Users can manage own lab orders"
  ON public.lab_orders
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Guardians can view ward lab orders"
  ON public.lab_orders
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.guardians g
      WHERE g.guardian_user_id = auth.uid()
        AND g.user_id = lab_orders.user_id
        AND g.status = 'accepted'
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lab_orders_user_id ON public.lab_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_created_at ON public.lab_orders(created_at DESC);