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
