import { z } from "zod";

import { LOGIN_EMAIL_HINT, loginEmailUsesManagedDomain } from "@/lib/login-email";
import type { CloudflareZone } from "./types";

export type OwnerDraft = {
  email: string;
  name: string;
  password: string;
};

export type OwnerErrors = Partial<Record<keyof OwnerDraft, string>>;

export type MailboxDraft = {
  address: string;
  displayName: string;
};

export type MailboxErrors = {
  form?: string;
  rows: Array<{
    address?: string;
    displayName?: string;
  }>;
};

export type DomainErrors = {
  appSubdomain?: string;
  selectedZoneIds?: string;
  portalZoneId?: string;
};

const emailSchema = z.string().trim().email().max(254);
const appSubdomainPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function validateDomain(input: {
  appSubdomain: string;
  selectedZones: CloudflareZone[];
  portalZone: CloudflareZone | null;
}): DomainErrors {
  const errors: DomainErrors = {};

  if (input.selectedZones.length === 0) {
    errors.selectedZoneIds = "Choose at least one email domain.";
  } else if (input.selectedZones.length > 10) {
    errors.selectedZoneIds = "Choose up to 10 email domains during setup.";
  } else if (input.selectedZones.some((zone) => zone.status !== "active")) {
    errors.selectedZoneIds = "Every selected email domain must be active.";
  }
  if (!input.portalZone || !input.selectedZones.some((zone) => zone.id === input.portalZone?.id)) {
    errors.portalZoneId = "Choose which selected domain hosts the workspace portal.";
  }

  const subdomain = input.appSubdomain.trim().toLowerCase();
  if (!appSubdomainPattern.test(subdomain)) {
    errors.appSubdomain = "Use one DNS label, such as hqbase or inbox.";
  }
  return errors;
}

export function validateOwner(owner: OwnerDraft, managedDomains: string[] = []): OwnerErrors {
  const errors: OwnerErrors = {};
  const name = owner.name.trim();

  if (!name) errors.name = "Enter your name.";
  else if (name.length > 100) errors.name = "Name must be 100 characters or fewer.";

  const normalizedEmail = owner.email.trim().toLowerCase();
  if (!emailSchema.safeParse(normalizedEmail).success) errors.email = "Enter a valid Login email.";
  else if (loginEmailUsesManagedDomain(normalizedEmail, managedDomains)) {
    errors.email = LOGIN_EMAIL_HINT;
  }

  if (owner.password.length < 8) {
    errors.password = "Use at least 8 characters.";
  } else if (owner.password.length > 128) {
    errors.password = "Password must be 128 characters or fewer.";
  }

  return errors;
}

export function validateMailboxes(
  mailboxes: MailboxDraft[],
  emailDomains: string[]
): MailboxErrors {
  const rows: MailboxErrors["rows"] = mailboxes.map(() => ({}));
  const seen = new Map<string, number>();
  let form: string | undefined;

  if (mailboxes.length === 0) form = "Add at least one shared mailbox.";
  else if (mailboxes.length > 20) form = "HQBase setup supports up to 20 initial mailboxes.";

  mailboxes.forEach((mailbox, index) => {
    const address = mailbox.address.trim().toLowerCase();
    const displayName = mailbox.displayName.trim();

    if (!emailSchema.safeParse(address).success) {
      rows[index] = { ...rows[index], address: "Enter a valid email address." };
    } else if (!emailDomains.includes(address.split("@")[1] ?? "")) {
      rows[index] = {
        ...rows[index],
        address: "Use one of the connected email domains."
      };
    } else {
      const previousIndex = seen.get(address);
      if (previousIndex !== undefined) {
        rows[index] = { ...rows[index], address: "Each mailbox address must be unique." };
        rows[previousIndex] = {
          ...rows[previousIndex],
          address: "Each mailbox address must be unique."
        };
      } else {
        seen.set(address, index);
      }
    }

    if (!displayName) {
      rows[index] = { ...rows[index], displayName: "Enter a display name." };
    } else if (displayName.length > 80) {
      rows[index] = { ...rows[index], displayName: "Use 80 characters or fewer." };
    }
  });

  return form ? { form, rows } : { rows };
}

export function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

export function hasMailboxErrors(errors: MailboxErrors): boolean {
  return Boolean(errors.form || errors.rows.some((row) => hasErrors(row)));
}
