import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// MSG91 OneAPI delivery report webhook for SOS.
//
// Configure this URL in MSG91 dashboard:
//
// https://magnrdegcegxdtgapyez.supabase.co/functions/v1/sos-delivery-webhook
//
// MSG91 webhook payloads can differ depending on the configured webhook
// version/service. This function accepts:
//   - JSON payloads
//   - application/x-www-form-urlencoded payloads
//   - payloads containing data arrays
//   - nested report arrays
//
// For the new OneAPI flow we primarily use:
//   oneApiRequestId / requestId
//   customerNumber / telNum / number
//   eventName / event / status
//   reason / failureReason / failedReason / description
//   ts / deliveryTime
//
// The database attempts created by send-sos-alert use:
//   channel = "oneapi"
//   provider = "msg91"

type DeliveryStatus = "delivered" | "failed" | "sent" | "unknown";

function parseStatus(raw: any, eventRaw?: any): DeliveryStatus {
  const values = [raw, eventRaw]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value).trim().toLowerCase());

  for (const value of values) {
    // MSG91 webhook status codes:
    // 0 = Sent
    // 1 = Delivered
    // 2 = Failed
    // 9 = NDNC
    // 16 / 25 = Rejected
    // 17 = Blocked
    // 20 = Country code blocked
    if (value === "1") return "delivered";
    if (
      value === "2" ||
      value === "9" ||
      value === "16" ||
      value === "17" ||
      value === "20" ||
      value === "25"
    ) {
      return "failed";
    }

    if (value === "0") return "sent";

    if (
      value.includes("deliver") ||
      value === "read" ||
      value.includes("read")
    ) {
      return "delivered";
    }

    if (
      value.includes("fail") ||
      value.includes("reject") ||
      value.includes("undeliver") ||
      value.includes("block") ||
      value.includes("ndnc")
    ) {
      return "failed";
    }

    if (
      value.includes("sent") ||
      value.includes("submit") ||
      value.includes("accept") ||
      value.includes("request")
    ) {
      return "sent";
    }
  }

  return "unknown";
}

function normalizePhone(raw: any): string | null {
  if (raw === undefined || raw === null) return null;

  const phone = String(raw).trim().replace(/[^\d]/g, "");

  return phone || null;
}

function normalizeTimestamp(raw: any): string | null {
  if (raw === undefined || raw === null || raw === "") {
    return null;
  }

  // MSG91 may send Unix timestamps in seconds.
  if (typeof raw === "number") {
    const milliseconds =
      raw < 100000000000 ? raw * 1000 : raw;

    const date = new Date(milliseconds);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const value = String(raw).trim();

  // Numeric timestamp represented as a string.
  if (/^\d+$/.test(value)) {
    const numeric = Number(value);
    const milliseconds =
      numeric < 100000000000 ? numeric * 1000 : numeric;

    const date = new Date(milliseconds);

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return date.toISOString();
  }

  return null;
}

async function readPayload(req: Request): Promise<any> {
  const contentType = req.headers.get("content-type") || "";
  const text = await req.text();

  if (!text) {
    return {};
  }

  // JSON payload.
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      // Fall through to other parsers.
    }
  }

  // Form encoded payload.
  if (
    contentType.includes(
      "application/x-www-form-urlencoded"
    )
  ) {
    const params = new URLSearchParams(text);

    const data = params.get("data");

    if (data) {
      try {
        const parsed = JSON.parse(data);

        if (Array.isArray(parsed)) {
          return { data: parsed };
        }

        return parsed;
      } catch {
        // Continue with normal key/value parsing.
      }
    }

    const obj: Record<string, string> = {};

    params.forEach((value, key) => {
      obj[key] = value;
    });

    return obj;
  }

  // Last resort: attempt JSON.
  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text,
    };
  }
}

/**
 * MSG91 can return:
 *
 * {
 *   data: [...]
 * }
 *
 * or:
 *
 * [
 *   {...}
 * ]
 *
 * or a single event object.
 *
 * Additionally, older SMS webhook formats can contain:
 *
 * {
 *   requestId: "...",
 *   report: [
 *     {...}
 *   ]
 * }
 *
 * Normalize all of those into individual event objects.
 */
function extractEvents(payload: any): any[] {
  const events: any[] = [];

  const addEvent = (value: any) => {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        addEvent(item);
      }
      return;
    }

    if (typeof value !== "object") {
      return;
    }

    // If this is a report container, propagate its parent request ID
    // into each individual report item.
    if (Array.isArray(value.report)) {
      const parentRequestId =
        value.oneApiRequestId ||
        value.requestId ||
        value.request_id ||
        value.requestID ||
        value.id ||
        null;

      for (const report of value.report) {
        if (
          report &&
          typeof report === "object"
        ) {
          events.push({
            ...value,
            ...report,
            oneApiRequestId:
              report.oneApiRequestId ??
              value.oneApiRequestId,
            requestId:
              report.requestId ??
              parentRequestId,
          });
        }
      }

      return;
    }

    // Normal event.
    events.push(value);
  };

  if (Array.isArray(payload)) {
    addEvent(payload);
  } else if (Array.isArray(payload?.data)) {
    addEvent(payload.data);
  } else if (payload?.data) {
    addEvent(payload.data);
  } else {
    addEvent(payload);
  }

  return events;
}

function getRequestId(ev: any): string | null {
  const value =
    ev?.oneApiRequestId ??
    ev?.one_api_request_id ??
    ev?.requestId ??
    ev?.request_id ??
    ev?.requestID ??
    ev?.request_id ??
    ev?.id ??
    null;

  return value ? String(value).trim() : null;
}

function getRecipient(ev: any): string | null {
  const value =
    ev?.customerNumber ??
    ev?.customer_number ??
    ev?.telNum ??
    ev?.tel_num ??
    ev?.mobile ??
    ev?.mobiles ??
    ev?.number ??
    ev?.recipient ??
    ev?.to ??
    ev?.phone ??
    null;

  return normalizePhone(value);
}

function getRawStatus(ev: any): any {
  return (
    ev?.eventName ??
    ev?.event_name ??
    ev?.event ??
    ev?.status ??
    ev?.report_status ??
    ev?.deliveryStatus ??
    ev?.delivery_status ??
    null
  );
}

function getFailureReason(ev: any): string | null {
  const value =
    ev?.reason ??
    ev?.failureReason ??
    ev?.failure_reason ??
    ev?.failedReason ??
    ev?.failed_reason ??
    ev?.desc ??
    ev?.description ??
    null;

  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return null;
  }

  return String(value).slice(0, 500);
}

function getDeliveryTimestamp(ev: any): string | null {
  return normalizeTimestamp(
    ev?.deliveryTime ??
      ev?.delivery_time ??
      ev?.delivered_at ??
      ev?.ts ??
      ev?.timestamp ??
      ev?.sentTime ??
      ev?.sent_time ??
      null
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed",
      }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const payload = await readPayload(req);

    console.log(
      "[sos-delivery-webhook] received:",
      JSON.stringify(payload).slice(0, 3000)
    );

    const events = extractEvents(payload);

    if (events.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          updated: 0,
          message: "No delivery events found",
        }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY"
    );

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    let updated = 0;

    for (const ev of events) {
      try {
        const requestId = getRequestId(ev);
        const recipient = getRecipient(ev);
        const rawStatus = getRawStatus(ev);
        const failureReason = getFailureReason(ev);
        const deliveredAt = getDeliveryTimestamp(ev);

        const normalized = parseStatus(
          ev?.status,
          ev?.eventName ?? ev?.event
        );

        console.log(
          "[sos-delivery-webhook] normalized event:",
          JSON.stringify({
            requestId,
            recipient,
            rawStatus,
            normalized,
            failureReason,
            deliveredAt,
          })
        );

        // We need at least one identifier to safely update an attempt.
        if (!requestId && !recipient) {
          console.warn(
            "[sos-delivery-webhook] skipping event with no request ID or recipient:",
            JSON.stringify(ev).slice(0, 1000)
          );
          continue;
        }

        const update: Record<string, any> = {
          delivery_status:
            normalized === "unknown"
              ? rawStatus
                ? String(rawStatus)
                : "unknown"
              : normalized,
        };

        if (normalized === "delivered") {
          update.delivered_at =
            deliveredAt ??
            new Date().toISOString();
        }

        if (normalized === "failed") {
          update.failed_at =
            new Date().toISOString();

          if (failureReason) {
            update.failure_reason =
              failureReason;
          }
        }

        /*
         * IMPORTANT:
         *
         * send-sos-alert now stores:
         *
         *   channel  = "oneapi"
         *   provider = "msg91"
         *
         * Therefore the webhook must not update old WhatsApp/SMS
         * attempts accidentally.
         */

        let query =
          admin
            .from("sos_message_attempts")
            .update(update)
            .eq("channel", "oneapi");

        if (requestId) {
          /*
           * OneAPI webhook:
           *
           * oneApiRequestId is the preferred identifier.
           *
           * requestId is supported as a fallback because MSG91
           * webhook configurations may expose the request ID under
           * requestId instead.
           */
          query = query.eq(
            "request_id",
            requestId
          );
        } else if (recipient) {
          /*
           * If MSG91 sends only the recipient number, update the
           * latest pending OneAPI attempt for that number.
           *
           * We intentionally require a pending-ish status so that
           * an old delivered/failed attempt isn't overwritten by a
           * later callback lacking request_id.
           */
          query = query
            .eq(
              "recipient_phone",
              recipient
            )
            .in("delivery_status", [
              "pending",
              "sent",
              "accepted",
              "queued",
              "unknown",
            ])
            .order("created_at", {
              ascending: false,
            })
            .limit(1);
        }

        const {
          error,
          count,
        } = await query.select("id", {
          count: "exact",
          head: true,
        });

        if (error) {
          console.error(
            "[sos-delivery-webhook] update error:",
            error.message,
            {
              requestId,
              recipient,
              normalized,
            }
          );

          continue;
        }

        updated += count ?? 0;
      } catch (eventError) {
        console.error(
          "[sos-delivery-webhook] event processing error:",
          eventError
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        received: events.length,
        updated,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error(
      "[sos-delivery-webhook] fatal:",
      err
    );

    /*
     * Return 200 for a parsed-but-problematic provider payload only
     * where possible, because MSG91 retries webhook requests when
     * the endpoint returns 4xx/5xx. Here a 500 indicates a genuine
     * server/configuration failure.
     */
    return new Response(
      JSON.stringify({
        error: String(err),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
