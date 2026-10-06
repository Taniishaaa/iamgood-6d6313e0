export interface Person {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  role: string;
  roles: string[];
  plan: string | null;
  plan_expires_at: string | null;
  is_trial: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
  last_active_at: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
  ward_count: number;
  guardian_count: number;
}

export interface PeopleFilter {
  query: string;
  role: string;
  plan: string;
  inactiveOnly: boolean;
  now?: Date;
}

const INACTIVE_DAYS = 30;

export const ROLE_OPTIONS = [
  { value: "all", label: "All roles" },
  { value: "user", label: "Wards" },
  { value: "guardian", label: "Guardians" },
  { value: "admin", label: "Admins" },
];

export const PLAN_OPTIONS = [
  { value: "all", label: "Any plan" },
  { value: "free", label: "Free / none" },
  { value: "basic", label: "Basic" },
  { value: "premium", label: "Pro" },
  { value: "premium-plus", label: "Premium Plus" },
];

export const PLAN_LABELS: Record<string, string> = {
  basic: "Basic",
  premium: "Pro",
  pro: "Pro",
  "premium-plus": "Premium Plus",
  "vitals-storage": "Extra storage",
};

export function planLabel(person: Person): string {
  if (!person.plan) return "Free";
  const base = PLAN_LABELS[person.plan] ?? person.plan;
  return person.is_trial ? `${base} (trial)` : base;
}

/** Destructive actions require the admin to type the person's exact name. */
export function matchesNameConfirmation(input: string, expected: string): boolean {
  const a = input.trim().toLowerCase();
  const b = expected.trim().toLowerCase();
  return a.length > 0 && b.length > 0 && a === b;
}

export function isInactive(person: Person, now: Date = new Date()): boolean {
  const stamp = person.last_active_at ?? person.last_sign_in_at ?? person.created_at;
  if (!stamp) return true;
  const at = new Date(stamp).getTime();
  if (Number.isNaN(at)) return true;
  return now.getTime() - at > INACTIVE_DAYS * 24 * 60 * 60 * 1000;
}

export function filterPeople(people: Person[], filter: PeopleFilter): Person[] {
  const q = filter.query.trim().toLowerCase();
  const now = filter.now ?? new Date();
  return people.filter((p) => {
    if (filter.role !== "all" && p.role !== filter.role) return false;
    if (filter.plan !== "all") {
      if (filter.plan === "free") {
        if (p.plan) return false;
      } else if (p.plan !== filter.plan) {
        return false;
      }
    }
    if (filter.inactiveOnly && !isInactive(p, now)) return false;
    if (!q) return true;
    return (
      (p.full_name ?? "").toLowerCase().includes(q) ||
      (p.phone ?? "").toLowerCase().includes(q) ||
      (p.email ?? "").toLowerCase().includes(q)
    );
  });
}
