
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE_URL = "https://sandbox-partner-api.orangehealth.dev";
const ORANGE_API_KEY = Deno.env.get("ORANGE_HEALTH_API_KEY");

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const isValidDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isValidSlotDateTime = (value: unknown): value is string => {
  if (typeof value !== "string") return false;

  // Orange Health returns local collection times such as
  // 2026-10-16T06:00:00. Do not convert them to another timezone.
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/
  );

  return Boolean(match && isValidDate(match[1]));
};

const parseProviderResponse = async (res: Response) => {
  if (res.status === 204) return null;

  const text = await res.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      console.error("Missing Supabase environment configuration");
      return jsonResponse(
        { error: "Server configuration is incomplete" },
        500
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    let body: Record<string, any>;

    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON request body" }, 400);
    }

    const { action } = body;

    // 1. Serviceability and collection slots
    if (action === "serviceability") {
      const { latitude, longitude, request_date, pincode, address } = body;

      if (!isValidDate(request_date)) {
        return jsonResponse(
          { error: "request_date must be a valid YYYY-MM-DD date" },
          400
        );
      }

      const cleanAddress =
        typeof address === "string" ? address.trim() : "";
      const cleanPincode =
        typeof pincode === "string" || typeof pincode === "number"
          ? String(pincode).trim()
          : "";

      const hasLatitude =
        latitude !== null &&
        latitude !== undefined &&
        String(latitude).trim() !== "";
      const hasLongitude =
        longitude !== null &&
        longitude !== undefined &&
        String(longitude).trim() !== "";

      const hasCoordinates = hasLatitude && hasLongitude;

      // Select exactly one supported location mode.
      // Address takes priority because it represents the collection address.
      const params = new URLSearchParams();
      params.set("request_date", request_date);

      if (cleanAddress) {
        params.set("address", cleanAddress);
      } else if (hasCoordinates) {
        const lat = Number(latitude);
        const lng = Number(longitude);

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          return jsonResponse(
            { error: "Invalid latitude or longitude" },
            400
          );
        }

        params.set("latitude", String(lat));
        params.set("longitude", String(lng));
      } else if (cleanPincode) {
        params.set("pincode", cleanPincode);
      } else {
        return jsonResponse(
          {
            error:
              "Provide a collection address, latitude and longitude, or pincode",
          },
          400
        );
      }

      if (!ORANGE_API_KEY) {
        console.error("ORANGE_API_KEY is not configured");
        return jsonResponse(
          { error: "Orange Health API is not configured" },
          500
        );
      }

      const url = `${BASE_URL}/v1/partner/serviceability?${params.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        headers: { api_key: ORANGE_API_KEY },
      });

      const data = await parseProviderResponse(res);

      // Preserve Orange Health's response body, including its slot keys,
      // slot_datetime values, slot flags, and serviceability status.
      return jsonResponse({ status: res.status, data }, res.ok ? 200 : res.status);
    }

    // 2. Discover tests and packages
    if (action === "discover") {
      const { latitude, longitude, pincode, address } = body;

      const cleanAddress =
        typeof address === "string" ? address.trim() : "";
      const cleanPincode =
        typeof pincode === "string" || typeof pincode === "number"
          ? String(pincode).trim()
          : "";

      const hasLatitude =
        latitude !== null &&
        latitude !== undefined &&
        String(latitude).trim() !== "";
      const hasLongitude =
        longitude !== null &&
        longitude !== undefined &&
        String(longitude).trim() !== "";

      const params = new URLSearchParams();

      if (cleanAddress) {
        params.set("address", cleanAddress);
      } else if (hasLatitude && hasLongitude) {
        const lat = Number(latitude);
        const lng = Number(longitude);

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          return jsonResponse(
            { error: "Invalid latitude or longitude" },
            400
          );
        }

        params.set("latitude", String(lat));
        params.set("longitude", String(lng));
      } else if (cleanPincode) {
        params.set("pincode", cleanPincode);
      } else {
        return jsonResponse(
          {
            error:
              "Provide an address, latitude and longitude, or pincode",
          },
          400
        );
      }

      if (!ORANGE_API_KEY) {
        return jsonResponse(
          { error: "Orange Health API is not configured" },
          500
        );
      }

      const res = await fetch(
        `${BASE_URL}/v1/partner/discover?${params.toString()}`,
        { headers: { api_key: ORANGE_API_KEY } }
      );

      const data = await parseProviderResponse(res);

      return jsonResponse(
        { status: res.status, data },
        res.ok ? 200 : res.status
      );
    }

    // 3. Create an at-home collection order
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

      if (
        typeof address !== "string" ||
        !address.trim() ||
        typeof primary_patient_name !== "string" ||
        !primary_patient_name.trim() ||
        !primary_patient_number ||
        !isValidSlotDateTime(slot_datetime) ||
        !Array.isArray(patient_details) ||
        patient_details.length === 0
      ) {
        return jsonResponse(
          { error: "Missing or invalid required booking details" },
          400
        );
      }

      if (!ORANGE_API_KEY) {
        return jsonResponse(
          { error: "Orange Health API is not configured" },
          500
        );
      }

      const phoneDigits = String(primary_patient_number).replace(/\D/g, "");
      const cleanPhone =
        phoneDigits.length > 10 && phoneDigits.startsWith("91")
          ? phoneDigits.slice(2)
          : phoneDigits;

      if (!/^\d{10}$/.test(cleanPhone)) {
        return jsonResponse(
          { error: "primary_patient_number must be a valid 10-digit number" },
          400
        );
      }

      const firstPatient = patient_details[0];

      if (
        !firstPatient ||
        !Array.isArray(firstPatient.tests) ||
        firstPatient.tests.length === 0
      ) {
        return jsonResponse(
          { error: "At least one test is required for the patient" },
          400
        );
      }

      const hasLatitude =
        latitude !== null &&
        latitude !== undefined &&
        String(latitude).trim() !== "";
      const hasLongitude =
        longitude !== null &&
        longitude !== undefined &&
        String(longitude).trim() !== "";

      let location: { latitude: string; longitude: string } | undefined;

      if (hasLatitude && hasLongitude) {
        const lat = Number(latitude);
        const lng = Number(longitude);

        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          lat < -90 ||
          lat > 90 ||
          lng < -180 ||
          lng > 180
        ) {
          return jsonResponse(
            { error: "Invalid latitude or longitude" },
            400
          );
        }

        location = {
          latitude: String(lat),
          longitude: String(lng),
        };
      }

      const orangePayload: Record<string, any> = {
        address: address.trim(),
        primary_patient_name: primary_patient_name.trim(),
        primary_patient_number: cleanPhone,
        // Forward the exact local slot string returned by Orange Health.
        slot_datetime,
        payment_type: "paid_by_patient",
        partner_notes: partner_notes || "Booking via Check-iN Health",
        patient_details,
      };

      if (location) {
        orangePayload.location = location;
      }

      const res = await fetch(`${BASE_URL}/v1/partner/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          api_key: ORANGE_API_KEY,
        },
        body: JSON.stringify(orangePayload),
      });

      const data = await parseProviderResponse(res);

      if (!res.ok) {
        return jsonResponse(
          {
            error: "Failed to create order with Orange Health",
            details: data,
          },
          res.status
        );
      }

      // Save the successfully created Orange Health order.
      const orangeOrderId =
        data?.order_id || data?.id || data?.alnum_order_id || null;
      const cityRequestId =
        data?.city_request_id || data?.request_id || null;

      const ageValue = firstPatient?.age;
      const parsedAge =
        ageValue !== null &&
        ageValue !== undefined &&
        String(ageValue).trim() !== ""
          ? Number.parseInt(String(ageValue), 10)
          : null;

      const { data: dbOrder, error: dbError } = await serviceClient
        .from("lab_orders")
        .insert({
          user_id: user.id,
          orange_order_id: orangeOrderId ? String(orangeOrderId) : null,
          city_request_id: cityRequestId ? String(cityRequestId) : null,
          patient_name: primary_patient_name.trim(),
          patient_phone: cleanPhone,
          patient_age:
            parsedAge !== null && Number.isFinite(parsedAge)
              ? parsedAge
              : null,
          patient_gender: firstPatient?.gender || null,
          address: address.trim(),
          latitude: location ? Number(location.latitude) : null,
          longitude: location ? Number(location.longitude) : null,
          slot_datetime,
          tests: firstPatient?.tests || [],
          status: "scheduled",
          payment_status: "pending",
          notes: partner_notes || null,
          raw_response: data,
        })
        .select()
        .single();

      if (dbError) {
        // The Orange Health order already exists; do not report that
        // provider booking as failed just because local persistence failed.
        console.error("Failed to save lab order to database:", dbError);
      }

      return jsonResponse({
        success: true,
        order: dbOrder || data,
      });
    }

    // 4. Retrieve test results and reports
    if (action === "test-results") {
      const { primary_patient_number, order_id } = body;
      const numberToQuery = primary_patient_number || user.phone;

      if (!numberToQuery) {
        return jsonResponse(
          { error: "primary_patient_number is required" },
          400
        );
      }

      if (!ORANGE_API_KEY) {
        return jsonResponse(
          { error: "Orange Health API is not configured" },
          500
        );
      }

      const digits = String(numberToQuery).replace(/\D/g, "");
      const cleanPhone =
        digits.length > 10 && digits.startsWith("91")
          ? digits.slice(2)
          : digits;

      if (!/^\d{10}$/.test(cleanPhone)) {
        return jsonResponse(
          { error: "A valid 10-digit patient number is required" },
          400
        );
      }

      const res = await fetch(
        `${BASE_URL}/v1/partner/test-results?primary_patient_number=${encodeURIComponent(cleanPhone)}`,
        { headers: { api_key: ORANGE_API_KEY } }
      );

      if (res.status === 204) {
        return jsonResponse({
          ready: false,
          message: "Reports not ready yet",
        });
      }

      const data = await parseProviderResponse(res);

      if (!res.ok) {
        return jsonResponse(
          { error: "Failed to retrieve test results", details: data },
          res.status
        );
      }

      if (order_id && data?.report_url) {
        const { error: updateError } = await serviceClient
          .from("lab_orders")
          .update({
            report_url: data.report_url,
            report_data: data,
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", order_id)
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Failed to update lab report:", updateError);
        }
      }

      return jsonResponse({ ready: true, data });
    }

    // 5. Cancel an order
    if (action === "cancel-order") {
      const { city_request_id, cancellation_reason } = body;

      if (!city_request_id) {
        return jsonResponse(
          { error: "city_request_id is required" },
          400
        );
      }

      if (!ORANGE_API_KEY) {
        return jsonResponse(
          { error: "Orange Health API is not configured" },
          500
        );
      }

      const res = await fetch(
        `${BASE_URL}/v1/partner/${encodeURIComponent(String(city_request_id))}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            api_key: ORANGE_API_KEY,
          },
          body: JSON.stringify({
            cancellation_reason:
              cancellation_reason || "Customer requested",
          }),
        }
      );

      const data = await parseProviderResponse(res);

      if (res.ok) {
        const { error: updateError } = await serviceClient
          .from("lab_orders")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("city_request_id", city_request_id)
          .eq("user_id", user.id);

        if (updateError) {
          console.error("Failed to update cancelled order:", updateError);
        }
      }

      return jsonResponse(
        { status: res.status, data },
        res.ok ? 200 : res.status
      );
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (err) {
    console.error("orange-health edge function error:", err);

    return jsonResponse(
      { error: "An unexpected error occurred while processing the request" },
      500
    );
  }
});
