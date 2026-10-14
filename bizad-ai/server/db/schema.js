import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),

 email: text("email")
  .notNull()
  .unique(),

name: text("name"),

passwordHash: text("password_hash"),

  // =====================================================
  // PLAN & USAGE
  // =====================================================

  plan: text("plan")
    .notNull()
    .default("free"),

  creditsRemaining: integer("credits_remaining")
    .notNull()
    .default(25),

  creditsUsed: integer("credits_used")
    .notNull()
    .default(0),

  creditsResetAt: timestamp("credits_reset_at"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});

export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),

  businessName: text("business_name")
    .notNull(),

  category: text("category")
    .notNull(),

  description: text("description")
    .notNull(),

  audience: text("audience"),

  location: text("location"),

  contact: text("contact"),

  website: text("website"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),

  businessId: integer("business_id")
    .references(() => businesses.id)
    .notNull(),

  adType: text("ad_type")
    .notNull(),

  offer: text("offer"),

  campaignText: text("campaign_text"),

  flyerImage: text("flyer_image"),

  videoId: text("video_id"),

  videoSeconds: integer("video_seconds"),

  createdAt: timestamp("created_at")
    .defaultNow()
    .notNull(),
});

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => users.id),

  reference: text("reference")
    .notNull()
    .unique(),

  event: text("event")
    .notNull(),

  status: text("status")
    .notNull(),

  amount: integer("amount")
    .notNull(),

  currency: text("currency")
    .notNull(),

  paystackCustomerCode:
    text("paystack_customer_code"),

  paystackSubscriptionCode:
    text("paystack_subscription_code"),

    subscriptionStatus:
  text("subscription_status"),

subscriptionEndsAt:
  timestamp("subscription_ends_at"),

  processedAt:
    timestamp("processed_at")
      .defaultNow()
      .notNull(),

  createdAt:
    timestamp("created_at")
      .defaultNow()
      .notNull(),
});