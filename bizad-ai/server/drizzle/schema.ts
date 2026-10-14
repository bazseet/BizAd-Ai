import { pgTable, foreignKey, serial, integer, text, timestamp, unique, real } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const businesses = pgTable("businesses", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	businessName: text("business_name").notNull(),
	category: text().notNull(),
	description: text().notNull(),
	audience: text(),
	location: text(),
	contact: text(),
	website: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "businesses_user_id_users_id_fk"
		}),
]);

export const campaigns = pgTable("campaigns", {
	id: serial().primaryKey().notNull(),
	userId: integer("user_id").notNull(),
	businessId: integer("business_id").notNull(),
	adType: text("ad_type").notNull(),
	offer: text(),
	campaignText: text("campaign_text"),
	flyerImage: text("flyer_image"),
	videoId: text("video_id"),
	videoSeconds: integer("video_seconds"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "campaigns_user_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "campaigns_business_id_businesses_id_fk"
		}),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	email: text().notNull(),
	name: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	passwordHash: text("password_hash"),
}, (table) => [
	unique("users_email_unique").on(table.email),
]);

export const playingWithNeon = pgTable("playing_with_neon", {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	value: real(),
});
