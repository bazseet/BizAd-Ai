import { relations } from "drizzle-orm/relations";
import { users, businesses, campaigns } from "./schema";

export const businessesRelations = relations(businesses, ({one, many}) => ({
	user: one(users, {
		fields: [businesses.userId],
		references: [users.id]
	}),
	campaigns: many(campaigns),
}));

export const usersRelations = relations(users, ({many}) => ({
	businesses: many(businesses),
	campaigns: many(campaigns),
}));

export const campaignsRelations = relations(campaigns, ({one}) => ({
	user: one(users, {
		fields: [campaigns.userId],
		references: [users.id]
	}),
	business: one(businesses, {
		fields: [campaigns.businessId],
		references: [businesses.id]
	}),
}));