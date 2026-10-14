import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE_URL = "https://sandbox-partner-api.orangehealth.dev";
const ORANGE_API_KEY = Deno.env.get("ORANGE_HEALTH_API_KEY") || "xhljYaoYbPNaBhNH";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // 1. Serviceability & Slots API
    if (action === "serviceability") {
      const { latitude, longitude, request_date, pincode, address } = body;
      const params = new URLSearchParams();
      if (latitude) params.append("latitude", String(latitude));
      if (longitude) params.append("longitude", String(longitude));
      if (request_date) params.append("request_date", String(request_date));
      if (pincode) params.append("pincode", String(pincode));
      if (address) params.append("address", String(address));

      const res = await fetch(`${BASE_URL}/v1/partner/serviceability?${params.toString()}`, {
        headers: {
          api_key: ORANGE_API_KEY,
        },
      });

      const data = await res.json().catch(() => ({}));
      return new Response(JSON.stringify({ status: res.status, data }), {
        status: res.ok ? 200 : res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Discover Tests / Packages
    if (action === "discover") {
      const { latitude, longitude, pincode, address } = body;
      const params = new URLSearchParams();
      if (latitude) params.append("latitude", String(latitude));
      if (longitude) params.append("longitude", String(longitude));
      if (pincode) params.append("pincode", String(pincode));
      if (address) params.append("address", String(address));

      const res = await fetch(`${BASE_URL}/v1/partner/discover?${params.toString()}`, {
        headers: {
          api_key: ORANGE_API_KEY,
        },
      });

      const data = await res.json().catch(() => ({}));
      return new Response(JSON.stringify({ status: res.status, data }), {
        status: res.ok ? 200 : res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Create At-Home Order
    if (action === "create-order") {
      const {
        address,
        latitude,
        longitude,
        primary_patient_name,
        primary_patient_number,
        slot_datetime,
        partner_notes,
        patient_details,
      } = body;

      if (!address || !primary_patient_name || !primary_patient_number || !slot_datetime || !patient_details?.length) {
        return new Response(JSON.stringify({ error: "Missing required booking details" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const orangePayload = {
        address,
        location: {
          latitude: String(latitude || "12.93922"),
          longitude: String(longitude || "77.62539"),
        },
        primary_patient_name,
        primary_patient_number,
        slot_datetime,
        payment_type: "paid_by_patient", // Orange Labs manages payment link
        partner_notes: partner_notes || "Booking via Check-iN Health",
        patient_details,
      };

      const res = await fetch(`${BASE_URL}/v1/partner/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_key: ORANGE_API_KEY,
        },
        body: JSON.stringify(orangePayload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return new Response(JSON.stringify({ error: "Failed to create order with Orange Health", details: data }), {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Record in Supabase database
      const orangeOrderId = data?.order_id || data?.id || data?.alnum_order_id || null;
      const cityRequestId = data?.city_request_id || data?.request_id || null;

      const { data: dbOrder, error: dbError } = await serviceClient
        .from("lab_orders")
        .insert({
          user_id: user.id,
          orange_order_id: orangeOrderId ? String(orangeOrderId) : null,
          city_request_id: cityRequestId ? String(cityRequestId) : null,
          patient_name: primary_patient_name,
          patient_phone: primary_patient_number,
          patient_age: patient_details[0]?.age ? parseInt(patient_details[0].age, 10) : null,
          patient_gender: patient_details[0]?.gender || null,
          address,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          slot_datetime,
          tests: patient_details[0]?.tests || [],
          status: "scheduled",
          payment_status: "pending",
          notes: partner_notes || null,
          raw_response: data,
        })
        .select()
        .single();

      if (dbError) {
        console.error("Failed to save lab order to db:", dbError);
      }

      return new Response(JSON.stringify({ success: true, order: dbOrder || data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Retrieve Test Results & Reports
    if (action === "test-results") {
      const { primary_patient_number, order_id } = body;
      const numberToQuery = primary_patient_number || user.phone;

      if (!numberToQuery) {
        return new Response(JSON.stringify({ error: "primary_patient_number is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Format to 10 digits
      const digits = String(numberToQuery).replace(/\D/g, "");
      const cleanPhone = digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits;

      const res = await fetch(`${BASE_URL}/v1/partner/test-results?primary_patient_number=${cleanPhone}`, {
        headers: {
          api_key: ORANGE_API_KEY,
        },
      });

      if (res.status === 204) {
        // No results yet
        return new Response(JSON.stringify({ ready: false, message: "Reports not ready yet" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await res.json().catch(() => ({}));

      // Update lab_orders record if order_id is present
      if (order_id && data?.report_url) {
        await serviceClient
          .from("lab_orders")
          .update({
            report_url: data.report_url,
            report_data: data,
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order_id);
      }

      return new Response(JSON.stringify({ ready: true, data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Cancel Order
    if (action === "cancel-order") {
      const { city_request_id, cancellation_reason } = body;
      if (!city_request_id) {
        return new Response(JSON.stringify({ error: "city_request_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(`${BASE_URL}/v1/partner/${city_request_id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_key: ORANGE_API_KEY,
        },
        body: JSON.stringify({ cancellation_reason: cancellation_reason || "Customer requested" }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await serviceClient
          .from("lab_orders")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("city_request_id", city_request_id);
      }

      return new Response(JSON.stringify({ status: res.status, data }), {
        status: res.ok ? 200 : res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("orange-health edge function error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
