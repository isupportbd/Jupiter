import {
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp
} from "drizzle-orm/pg-core";
import { users } from "@/modules/auth/database/models/user.js";

/**
 * Main LC & Bond License Data Table
 * Matching the 31 columns from Bangladesh Bank exports
 */
export const bondRecords = pgTable(
  "bond_records",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onUpdate: "cascade", onDelete: "cascade" }),

    // Bank & Branch Details
    bankName: text("bank_name").notNull(),
    branchName: text("branch_name"),
    adsCode: text("ads_code"),

    // LC Specific Details
    lcYear: text("lc_year"),
    lcNature: text("lc_nature"),
    lcSerial: text("lc_serial"),
    lcId: text("lc_id"),
    lcValue: numeric("lc_value", { precision: 20, scale: 2 }).default("0"),
    currency: text("currency").default("USD"),
    lcDate: timestamp("lc_date", { withTimezone: true }),
    lcExpiryDate: timestamp("lc_expiry_date", { withTimezone: true }),
    bbUsansePeriod: text("bb_usanse_period"),
    lastShipDate: timestamp("last_ship_date", { withTimezone: true }),
    proceedsDate: timestamp("proceeds_date", { withTimezone: true }),

    // Applicant & Exporter Info
    applicantName: text("applicant_name"),
    irc: text("irc"),
    exporterInfo: text("exporter_info"),
    exportLcNumber: text("export_lc_number"),

    // Beneficiary Info
    beneficiaryBank: text("beneficiary_bank"),
    beneficiaryBranch: text("beneficiary_branch"),
    beneficiaryName: text("beneficiary_name"),
    beneficiaryAddress: text("beneficiary_address"),
    beneficiaryIrc: text("beneficiary_irc"),
    beneficiaryErc: text("beneficiary_erc"),

    // Proforma Invoice (PI) & Bond Details
    piNumber: text("pi_number"),
    piDate: timestamp("pi_date", { withTimezone: true }),
    bondLicense: text("bond_license"),

    // Status & Actions
    accepted: text("accepted"),
    cancelYn: text("cancel_yn").default("N"),
    cancelCause: text("cancel_cause"),
    entryDate: timestamp("entry_date", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  }
);
