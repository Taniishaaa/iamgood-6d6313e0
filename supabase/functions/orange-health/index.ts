import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE_URL = "https://sandbox-partner-api.orangehealth.dev";

type JsonObject = Record<string, any>;

function jsonResponse(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readJson(response: Response): Promise<JsonObject> {
  if (response.status === 204) return {};
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validSlotDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) &&
    !Number.isNaN(new Date(value).getTime())
  );
}

function cleanPhone(value: unknown): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function getLocation(latitude: unknown, longitude: unknown) {
  const lat = latitude === null || latitude === undefined || latitude === "" ? null : Number(latitude);
  const lng = longitude === null || longitude === undefined || longitude === "" ? null : Number(longitude);
  if (lat === null && lng === null) return null;
  if (
    lat === null ||
    lng === null ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    throw new Error("Both valid latitude and longitude are required when coordinates are provided.");
  }
  return { latitude: String(lat), longitude: String(lng) };
}

serve(async (req) => {
  console.log("orange-health request received:", req.method);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Required Supabase environment variables are missing.");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("ORANGE_HEALTH_API_KEY");
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonResponse({ error: "A valid JSON body is required" }, 400);
    const { action } = body;
    console.log("orange-health action:", action);

    if (["serviceability", "discover", "create-order", "test-results", "cancel-order"].includes(action) && !apiKey) {
      console.error("ORANGE_HEALTH_API_KEY Supabase secret is not configured.");
      return jsonResponse({ error: "Orange Health API key is not configured on the server" }, 500);
    }

    // Check serviceability and return the provider's slot map without changing its keys/values.
    if (action === "serviceability") {
      const { latitude, longitude, request_date, pincode } = body;
      const address = typeof body.address === "string" ? body.address.trim() : "";
      if (!validDate(request_date)) return jsonResponse({ error: "request_date must be a valid YYYY-MM-DD date" }, 400);

      const params = new URLSearchParams({ request_date });

      // Orange Health supports address-based serviceability and geocodes the
      // address internally. Prefer the selected collection address when present.
      if (address) {
        params.set("address", address);
      } else if (pincode) {
        params.set("pincode", String(pincode).trim());
      } else {
        try {
          const location = getLocation(latitude, longitude);

          if (!location) {
            return jsonResponse(
              {
                error: "Provide a collection address, pincode, or coordinates",
              },
              400,
            );
          }

          params.set("latitude", location.latitude);
          params.set("longitude", location.longitude);
        } catch (error) {
          return jsonResponse(
            {
              error: error instanceof Error ? error.message : "Invalid coordinates",
            },
            400,
          );
        }
      }

      console.log("Orange Health serviceability request:", {
        requestDate: request_date,
        hasAddressParam: params.has("address"),
        latitude: params.get("latitude"),
        longitude: params.get("longitude"),
        pincode: params.get("pincode"),
      });

      const response = await fetch(`${BASE_URL}/v1/partner/serviceability?${params.toString()}`, {
        headers: { api_key: apiKey! },
      });

      const data = await readJson(response);

      if (!response.ok) {
        return jsonResponse(
          {
            error: "Orange Health serviceability request failed",
            details: data,
            provider_status: response.status,
          },
          response.status,
        );
      }

      return jsonResponse({ status: response.status, data });
    }

    // Discover supported tests/packages. Location parameters are mutually exclusive.
    if (action === "discover") {
      const { latitude, longitude, pincode } = body;
      const address = typeof body.address === "string" ? body.address.trim() : "";
      const params = new URLSearchParams();
      try {
        if (address) params.set("address", address);
        else if (pincode) params.set("pincode", String(pincode).trim());
        else {
          const location = getLocation(latitude, longitude);
          if (location) {
            params.set("latitude", location.latitude);
            params.set("longitude", location.longitude);
          }
        }
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : "Invalid coordinates" }, 400);
      }
      const response = await fetch(`${BASE_URL}/v1/partner/discover${params.size ? `?${params.toString()}` : ""}`, {
        headers: { api_key: apiKey! },
      });
      const data = await readJson(response);
      if (!response.ok)
        return jsonResponse(
          { error: "Orange Health test discovery failed", details: data, provider_status: response.status },
          response.status,
        );
      return jsonResponse({ status: response.status, data });
    }

    // Create at-home booking, then persist the accepted provider response.
    if (action === "create-order") {
      const address = typeof body.address === "string" ? body.address.trim() : "";
      const primaryName = typeof body.primary_patient_name === "string" ? body.primary_patient_name.trim() : "";
      const primaryPhone = cleanPhone(body.primary_patient_number);
      const slotDateTime = body.slot_datetime;
      const patientDetails = body.patient_details;
      const paymentType = body.payment_type === "paid_by_group" ? "paid_by_group" : "paid_by_patient";

      if (
        !address ||
        !primaryName ||
        primaryPhone.length !== 10 ||
        !validSlotDateTime(slotDateTime) ||
        !Array.isArray(patientDetails) ||
        patientDetails.length === 0
      ) {
        return jsonResponse(
          {
            error:
              "Missing or invalid booking details. Address, patient name, 10-digit phone, valid slot_datetime and patient_details are required.",
          },
          400,
        );
      }

      const normalizedPatients = [];
      for (const patient of patientDetails) {
        const name = typeof patient?.patient_name === "string" ? patient.patient_name.trim() : "";
        const age = String(patient?.age ?? "").trim();
        const gender = String(patient?.gender ?? "").toLowerCase();
        const tests = Array.isArray(patient?.tests) ? patient.tests : [];
        const packages = Array.isArray(patient?.packages) ? patient.packages : [];
        if (!name || !age || !["male", "female", "other"].includes(gender) || (!tests.length && !packages.length)) {
          return jsonResponse(
            { error: "Each patient must have a name, age, valid gender, and at least one test or package." },
            400,
          );
        }
        normalizedPatients.push({
          ...(patient.partner_reference_id ? { partner_reference_id: String(patient.partner_reference_id) } : {}),
          patient_name: name,
          ...(patient.patient_phone ? { patient_phone: cleanPhone(patient.patient_phone) } : {}),
          age,
          gender,
          ...(tests.length ? { tests: tests.map((test: JsonObject) => ({ test_id: String(test.test_id) })) } : {}),
          ...(packages.length
            ? { packages: packages.map((pkg: JsonObject) => ({ package_id: String(pkg.package_id) })) }
            : {}),
        });
      }

      let location: { latitude: string; longitude: string } | null;
      try {
        location = getLocation(body.latitude, body.longitude);
      } catch (error) {
        return jsonResponse({ error: error instanceof Error ? error.message : "Invalid coordinates" }, 400);
      }

      const orangePayload: JsonObject = {
        address,
        ...(location ? { location } : {}),
        primary_patient_name: primaryName,
        primary_patient_number: primaryPhone,
        slot_datetime: slotDateTime,
        payment_type: paymentType,
        ...(typeof body.partner_notes === "string" && body.partner_notes.trim()
          ? { partner_notes: body.partner_notes.trim() }
          : {}),
        patient_details: normalizedPatients,
      };

      const response = await fetch(`${BASE_URL}/v1/partner/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", api_key: apiKey! },
        body: JSON.stringify(orangePayload),
      });
      const providerData = await readJson(response);

      // Orange documents HTTP 425 as a duplicate/previously accepted request. Do not create a new local row
      // or report a confirmed booking unless we have an accepted provider response.
      if (!response.ok) {
        return jsonResponse(
          {
            error:
              response.status === 425
                ? "Orange Health reports this request was already accepted. Check My Bookings before retrying."
                : "Failed to create order with Orange Health",
            details: providerData,
            provider_status: response.status,
          },
          response.status,
        );
      }

      const firstProviderOrder = Array.isArray(providerData.orders) ? providerData.orders[0] : null;
      const firstPatient = normalizedPatients[0];
      const clientTests = Array.isArray(body.selected_tests) ? body.selected_tests : [];
      const storedTests = clientTests.length
        ? clientTests
        : (firstPatient.tests || []).map((test: JsonObject) => ({ test_id: test.test_id }));

      const { data: dbOrder, error: dbError } = await serviceClient
        .from("lab_orders")
        .insert({
          user_id: user.id,
          orange_order_id:
            firstProviderOrder?.alnumOrderId != null
              ? String(firstProviderOrder.alnumOrderId)
              : firstProviderOrder?.id != null
                ? String(firstProviderOrder.id)
                : null,
          city_request_id: providerData.request_id != null ? String(providerData.request_id) : null,
          patient_name: primaryName,
          patient_phone: primaryPhone,
          patient_age: firstPatient.age ? Number.parseInt(firstPatient.age, 10) : null,
          patient_gender: firstPatient.gender || null,
          address,
          latitude: location ? Number(location.latitude) : null,
          longitude: location ? Number(location.longitude) : null,
          slot_datetime: slotDateTime,
          tests: storedTests,
          status: String(providerData.status || "scheduled").toLowerCase(),
          payment_status: "pending",
          notes: orangePayload.partner_notes || null,
          raw_response: providerData,
        })
        .select()
        .single();

      if (dbError) {
        console.error("Orange Health accepted booking, but saving lab_orders failed:", dbError);
        // Return provider confirmation but explicitly flag that local persistence failed.
        return jsonResponse(
          {
            success: true,
            provider_accepted: true,
            saved: false,
            order: providerData,
            warning:
              "Booking was accepted by Orange Health, but the local booking record could not be saved. Contact support before retrying.",
          },
          200,
        );
      }

      return jsonResponse(
        { success: true, provider_accepted: true, saved: true, order: dbOrder, provider: providerData },
        200,
      );
    }

    // Fetch results by primary patient number and update only the current user's local order.
    if (action === "test-results") {
      const numberToQuery = cleanPhone(body.primary_patient_number || user.phone);
      const orderId = typeof body.order_id === "string" ? body.order_id : "";
      if (numberToQuery.length !== 10)
        return jsonResponse({ error: "A valid 10-digit primary_patient_number is required" }, 400);

      if (orderId) {
        const { data: ownedOrder, error: ownedOrderError } = await serviceClient
          .from("lab_orders")
          .select("id")
          .eq("id", orderId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (ownedOrderError || !ownedOrder) return jsonResponse({ error: "Order not found" }, 404);
      }

      const response = await fetch(
        `${BASE_URL}/v1/partner/test-results?primary_patient_number=${encodeURIComponent(numberToQuery)}`,
        {
          headers: { api_key: apiKey! },
        },
      );
      if (response.status === 204) return jsonResponse({ ready: false, message: "Reports not ready yet" });
      const data = await readJson(response);
      if (!response.ok)
        return jsonResponse(
          { error: "Failed to fetch test results", details: data, provider_status: response.status },
          response.status,
        );

      const reportUrl = data.report_url || data.reportUrl || data.data?.report_url || null;
      if (orderId && reportUrl) {
        const { error: updateError } = await serviceClient
          .from("lab_orders")
          .update({
            report_url: String(reportUrl),
            report_data: data,
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId)
          .eq("user_id", user.id);
        if (updateError) console.error("Failed to update lab report:", updateError);
      }
      return jsonResponse({
        ready: Boolean(reportUrl),
        data,
        message: reportUrl ? "Test report is ready" : "Reports not ready yet",
      });
    }

    // Cancel an order. Ownership is checked against the local record before calling Orange Health.
    if (action === "cancel-order") {
      const requestId = typeof body.city_request_id === "string" ? body.city_request_id.trim() : "";
      const cancellationReason =
        typeof body.cancellation_reason === "string" ? body.cancellation_reason : "Customer requested";
      if (!requestId) return jsonResponse({ error: "city_request_id is required" }, 400);

      const { data: ownedOrder, error: ownedOrderError } = await serviceClient
        .from("lab_orders")
        .select("id")
        .eq("city_request_id", requestId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (ownedOrderError || !ownedOrder) return jsonResponse({ error: "Order not found" }, 404);

      const response = await fetch(`${BASE_URL}/v1/partner/${encodeURIComponent(requestId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", api_key: apiKey! },
        body: JSON.stringify({ cancellation_reason: cancellationReason }),
      });
      const data = await readJson(response);
      if (!response.ok)
        return jsonResponse(
          { error: "Failed to cancel Orange Health booking", details: data, provider_status: response.status },
          response.status,
        );

      const { error: updateError } = await serviceClient
        .from("lab_orders")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("city_request_id", requestId)
        .eq("user_id", user.id);
      if (updateError) console.error("Orange booking cancelled but local status update failed:", updateError);
      return jsonResponse({ success: true, status: response.status, data });
    }

    return jsonResponse({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("orange-health edge function error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unexpected server error" }, 500);
  }
});
