import { describe, expect, it } from "vitest";
import {
  filterPeople,
  isInactive,
  matchesNameConfirmation,
  type Person,
} from "@/lib/adminPeople";

const NOW = new Date("2026-10-06T12:00:00Z");

const person = (over: Partial<Person>): Person => ({
  id: crypto.randomUUID(),
  full_name: "Aldrin Alphonso",
  phone: "+918104919135",
  email: "aldrin@example.com",
  role: "user",
  roles: ["user"],
  plan: null,
  plan_expires_at: null,
  is_trial: false,
  blocked_at: null,
  blocked_reason: null,
  last_active_at: NOW.toISOString(),
  last_sign_in_at: NOW.toISOString(),
  created_at: NOW.toISOString(),
  ward_count: 1,
  guardian_count: 0,
  ...over,
});

const allFilter = { query: "", role: "all", plan: "all", inactiveOnly: false, now: NOW };

describe("matchesNameConfirmation", () => {
  it("accepts the exact name, ignoring case and surrounding spaces", () => {
    expect(matchesNameConfirmation("  Aldrin Alphonso ", "Aldrin Alphonso")).toBe(true);
    expect(matchesNameConfirmation("aldrin alphonso", "Aldrin Alphonso")).toBe(true);
  });

  it("refuses an empty, partial or different name", () => {
    expect(matchesNameConfirmation("", "Aldrin Alphonso")).toBe(false);
    expect(matchesNameConfirmation("Aldrin", "Aldrin Alphonso")).toBe(false);
    expect(matchesNameConfirmation("Someone Else", "Aldrin Alphonso")).toBe(false);
  });
});

describe("filterPeople", () => {
  const people = [
    person({ full_name: "Aldrin Alphonso", phone: "+918104919135", role: "user", roles: ["user"], plan: "premium-plus" }),
    person({ full_name: "Tanisha Gupta", phone: "+919819576467", email: "tanisha@example.com", role: "guardian", roles: ["guardian"], plan: null }),
    person({ full_name: "Ops Admin", phone: "+917000000000", email: "ops@example.com", role: "admin", roles: ["admin"], plan: null }),
    person({
      full_name: "Dormant Ward",
      phone: "+917000000001",
      email: "dormant@example.com",
      role: "user",
      roles: ["user"],
      plan: "basic",
      last_active_at: "2026-01-01T00:00:00Z",
      last_sign_in_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    }),
  ];

  it("searches across name, phone and email", () => {
    expect(filterPeople(people, { ...allFilter, query: "tanisha" }).map((p) => p.full_name)).toEqual(["Tanisha Gupta"]);
    expect(filterPeople(people, { ...allFilter, query: "919819576467" }).length).toBe(1);
    expect(filterPeople(people, { ...allFilter, query: "dormant@" }).length).toBe(1);
  });

  it("filters by role and by plan, with 'free' meaning no paid plan", () => {
    expect(filterPeople(people, { ...allFilter, role: "guardian" }).length).toBe(1);
    expect(filterPeople(people, { ...allFilter, role: "admin" }).length).toBe(1);
    expect(filterPeople(people, { ...allFilter, plan: "premium-plus" }).map((p) => p.full_name)).toEqual(["Aldrin Alphonso"]);
    expect(filterPeople(people, { ...allFilter, plan: "free" }).map((p) => p.full_name)).toEqual(["Tanisha Gupta", "Ops Admin"]);
  });

  it("keeps only people not active in the last 30 days when asked", () => {
    const stale = filterPeople(people, { ...allFilter, inactiveOnly: true });
    expect(stale.map((p) => p.full_name)).toEqual(["Dormant Ward"]);
    expect(isInactive(people[0], NOW)).toBe(false);
    expect(isInactive(people[3], NOW)).toBe(true);
  });
});
