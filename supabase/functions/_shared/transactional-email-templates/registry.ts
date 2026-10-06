/// <reference types="npm:@types/react@18.3.1" />
import * as React from "npm:react@18.3.1";

export interface TemplateEntry {
  component: React.ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  to?: string;
  displayName?: string;
  previewData?: Record<string, any>;
}

import { template as contactConfirmation } from "./contact-confirmation.tsx";
import { template as welcome } from "./welcome.tsx";
import { template as appointmentConfirmation } from "./appointment-confirmation.tsx";
import { template as guardianInvitation } from "./guardian-invitation.tsx";
import { template as missedCheckinAlert } from "./missed-checkin-alert.tsx";
import { template as sosAlert } from "./sos-alert.tsx";
import { template as vitalAnomalyAlert } from "./vital-anomaly-alert.tsx";
import { template as premiumPlusWaitlistConfirmation } from "./premium-plus-waitlist-confirmation.tsx";
import { template as premiumPlusLaunch } from "./premium-plus-launch.tsx";
import { template as trialStarted } from "./trial-started.tsx";
import { template as admin2faCode } from "./admin-2fa-code.tsx";
import { template as emailHealthAlert } from "./email-health-alert.tsx";
// ── NEW ──
import { template as weeklyGuardianReport } from "./weekly-guardian-report.tsx";
import { template as passwordReset } from "./password-reset.tsx";

export const TEMPLATES: Record<string, TemplateEntry> = {
  "contact-confirmation": contactConfirmation,
  welcome: welcome,
  "appointment-confirmation": appointmentConfirmation,
  "guardian-invitation": guardianInvitation,
  "missed-checkin-alert": missedCheckinAlert,
  "sos-alert": sosAlert,
  "vital-anomaly-alert": vitalAnomalyAlert,
  "premium-plus-waitlist-confirmation": premiumPlusWaitlistConfirmation,
  "premium-plus-launch": premiumPlusLaunch,
  "trial-started": trialStarted,
  "admin-2fa-code": admin2faCode,
  "email-health-alert": emailHealthAlert,
  // ── NEW ──
  "weekly-guardian-report": weeklyGuardianReport,
};
