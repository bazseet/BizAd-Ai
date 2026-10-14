import express from "express";

import cors from "cors";

import dotenv from "dotenv";

import crypto from "node:crypto";
import OpenAI from "openai";

import {
  clerkClient,
  clerkMiddleware,
  getAuth,
} from "@clerk/express";

import { eq, and, desc, gte, sql } from "drizzle-orm";

import { db } from "./db.js";
import {
  users,
  businesses,
  campaigns,
  payments,
} from "./db/schema.js";

dotenv.config();

const app = express();

app.use(clerkMiddleware());

// =====================================================
// CONFIGURATION
// =====================================================

const PORT = 5000;

const VIDEO_DURATION = "12";
const VIDEO_SIZE = "720x1280";

// =====================================================
// VIDEO MODE
// =====================================================

// Safe default: never make a paid video API call unless
// live mode is explicitly enabled.
const VIDEO_MODE =
  (process.env.VIDEO_MODE || "mock").toLowerCase();

const ENABLE_BILLABLE_VIDEO =
  process.env.ENABLE_BILLABLE_VIDEO === "true";

// Public demo clip used only during mock development mode.
const MOCK_VIDEO_URL =
  process.env.MOCK_VIDEO_URL ||
  "/mock-videos/bizad-demo.mp4";

// Temporary in-memory video jobs.
// Restarting the server clears mock jobs, which is fine for development.
const mockVideoJobs = new Map();

// =====================================================
// PLAN & USAGE CONFIGURATION
// =====================================================

const FREE_CREDITS = 25;
const BUSINESS_MONTHLY_CREDITS = 200;

const CREDIT_COSTS = {
  adCopy: 1,
  whatsapp: 1,
  flyer: 3,
  video: 10,
};

const CLERK_SECRET_KEY =
  process.env.CLERK_SECRET_KEY;

const CLERK_PUBLISHABLE_KEY =
  process.env.CLERK_PUBLISHABLE_KEY;

if (
  !CLERK_SECRET_KEY ||
  !CLERK_PUBLISHABLE_KEY
) {
  console.error(
    "❌ Clerk keys are missing from server/.env"
  );
  process.exit(1);
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  })
);

app.use(
  express.json({
    limit: "20mb",

    verify: (req, res, buf) => {
      if (
        req.originalUrl ===
        "/api/payments/paystack-webhook"
      ) {
        req.rawBody = Buffer.from(buf);
      }
    },
  })
);

app.use(
  "/mock-videos",
  express.static("public")
);


// =====================================================
// OPENAI
// =====================================================

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =====================================================
// FRIENDLY ERROR HELPER
// =====================================================

function getFriendlyError(error, fallbackMessage) {
  const message = error?.message || "";
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("quota") ||
    lowerMessage.includes("429") ||
    lowerMessage.includes("rate limit") ||
    lowerMessage.includes("billing")
  ) {
    return "AI generation limit reached. BizAd AI couldn't generate this right now. Please check your OpenAI API usage or try again later.";
  }

  if (
    lowerMessage.includes("401") ||
    lowerMessage.includes("incorrect api key") ||
    lowerMessage.includes("api key") ||
    lowerMessage.includes("authentication")
  ) {
    return "BizAd AI could not connect to the AI service. Please check the API configuration.";
  }

  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("econn") ||
    lowerMessage.includes("fetch failed")
  ) {
    return "We couldn't connect to the AI service. Please check your internet connection and try again.";
  }

  return message || fallbackMessage;
}

// =====================================================
// AUTHENTICATION HELPERS
// =====================================================



// =====================================================
// AUTHENTICATION MIDDLEWARE
// =====================================================

async function requireAuth(req, res, next) {
  try {
    const { isAuthenticated, userId } = getAuth(req);

    if (!isAuthenticated || !userId) {
      return res.status(401).json({
        success: false,
        error: "Please log in to continue.",
      });
    }

    const clerkUser =
      await clerkClient.users.getUser(userId);

    const primaryEmail =
      clerkUser.emailAddresses.find(
        (email) =>
          email.id ===
          clerkUser.primaryEmailAddressId
      )?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress;

    if (!primaryEmail) {
      return res.status(401).json({
        success: false,
        error:
          "Your Clerk account does not have an email address.",
      });
    }

    const cleanEmail =
      primaryEmail.trim().toLowerCase();

    const foundUsers = await db
      .select()
      .from(users)
      .where(
        eq(
          users.email,
          cleanEmail
        )
      )
      .limit(1);

   let localUser =
  foundUsers[0];

if (!localUser) {
  const clerkName =
    [
      clerkUser.firstName,
      clerkUser.lastName,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || null;

  await db
    .insert(users)
    .values({
      email: cleanEmail,
      name: clerkName,
      plan: "free",
      creditsRemaining:
        FREE_CREDITS,
      creditsUsed: 0,
      creditsResetAt: null,
    })
    .onConflictDoNothing({
      target: users.email,
    });

  const createdUsers =
    await db
      .select()
      .from(users)
      .where(
        eq(
          users.email,
          cleanEmail
        )
      )
      .limit(1);

  if (createdUsers.length === 0) {
    return res.status(500).json({
      success: false,
      error:
        "Unable to create your BizAd account.",
    });
  }

  localUser =
    createdUsers[0];

  console.log(
    "✅ New BizAd account created:",
    localUser.email
  );
}

    req.user = {
      id: localUser.id,
      email: localUser.email,
      clerkUserId: userId,
    };

    next();
  } catch (error) {
    console.error(
      "❌ Clerk authentication error:",
      error
    );

    return res.status(401).json({
      success: false,
      error:
        "Unable to verify your account. Please sign in again.",
    });
  }
}

// =====================================================
// USAGE / CREDIT HELPERS
// =====================================================

function getPlanName(user) {
  return user?.plan === "business" ? "business" : "free";
}

async function refreshBusinessCredits(user) {
  if (getPlanName(user) !== "business") {
    return user;
  }

  const now = new Date();

  const resetAt =
    user.creditsResetAt
      ? new Date(user.creditsResetAt)
      : null;

  // Active paid billing period.
  if (
    !resetAt ||
    resetAt > now
  ) {
    return user;
  }

  // The paid billing period has expired.
  // Do NOT automatically grant another 200 credits.
  // A successful Paystack renewal webhook is responsible
  // for starting the next billing period.
  if (user.creditsRemaining <= 0) {
    return user;
  }

  const updatedUsers =
    await db
      .update(users)
      .set({
        creditsRemaining: 0,
      })
      .where(
        eq(
          users.id,
          user.id
        )
      )
      .returning();

  return updatedUsers[0] || user;
}
async function getUsageUser(userId) {
  const foundUsers = await db
    .select()
    .from(users)
    .where(
      eq(users.id, userId)
    )
    .limit(1);

  if (foundUsers.length === 0) {
    throw new Error(
      "User account could not be found."
    );
  }

  return refreshBusinessCredits(
    foundUsers[0]
  );
}

async function consumeCredits(
  userId,
  cost
) {
  if (
    !Number.isInteger(cost) ||
    cost <= 0
  ) {
    throw new Error(
      "Invalid credit cost."
    );
  }

  const user =
    await getUsageUser(userId);

  const plan =
    getPlanName(user);

  if (
    plan === "free" &&
    user.creditsRemaining < cost
  ) {
    const error =
      new Error(
        `You do not have enough credits for this action. You need ${cost} credit${cost === 1 ? "" : "s"}, but only ${user.creditsRemaining} remain.`
      );

    error.code =
      "INSUFFICIENT_CREDITS";

    error.status = 402;

    throw error;
  }

  if (
    plan === "business" &&
    user.creditsRemaining < cost
  ) {
    const error =
      new Error(
        "You have used all of your Business plan credits for this month."
      );

    error.code =
      "INSUFFICIENT_CREDITS";

    error.status = 402;

    throw error;
  }

  const updatedUsers =
    await db
      .update(users)
      .set({
        creditsRemaining:
          sql`${users.creditsRemaining} - ${cost}`,

        creditsUsed:
          sql`${users.creditsUsed} + ${cost}`,
      })
      .where(
        and(
          eq(
            users.id,
            userId
          ),

          gte(
            users.creditsRemaining,
            cost
          )
        )
      )
      .returning({
        id: users.id,
        plan: users.plan,

        creditsRemaining:
          users.creditsRemaining,

        creditsUsed:
          users.creditsUsed,

        creditsResetAt:
          users.creditsResetAt,
      });

  if (
    updatedUsers.length === 0
  ) {
    const error =
      new Error(
        "You do not have enough credits for this action."
      );

    error.code =
      "INSUFFICIENT_CREDITS";

    error.status = 402;

    throw error;
  }

  return updatedUsers[0];
}

async function refundCredits(
  userId,
  cost
) {
  if (
    !Number.isInteger(cost) ||
    cost <= 0
  ) {
    return;
  }

  await db
    .update(users)
    .set({
      creditsRemaining:
        sql`${users.creditsRemaining} + ${cost}`,

      creditsUsed:
        sql`${users.creditsUsed} - ${cost}`,
    })
    .where(
      eq(
        users.id,
        userId
      )
    );
}

function sendUsageError(
  res,
  error
) {
  if (
    error?.code ===
    "INSUFFICIENT_CREDITS"
  ) {
    return res.status(402).json({
      success: false,
      code:
        error.code,
      error:
        error.message,
    });
  }

  return null;
}


// =====================================================
// CURRENT USER
// =====================================================

app.get(
  "/api/auth/me",
  requireAuth,
  async (req, res) => {
    try {
      const foundUsers =
        await db
          .select({
            id:
              users.id,

            email:
              users.email,

            name:
              users.name,

            createdAt:
              users.createdAt,

            plan:
              users.plan,

            creditsRemaining:
              users.creditsRemaining,

            creditsUsed:
              users.creditsUsed,

            creditsResetAt:
              users.creditsResetAt,
          })
          .from(users)
          .where(
            eq(
              users.id,
              req.user.id
            )
          )
          .limit(1);

     if (
  foundUsers.length === 0
) {
  return res.status(401).json({
    success: false,
    error:
      "User account could not be found.",
  });
}

      const currentUser =
        await refreshBusinessCredits(
          foundUsers[0]
        );

      return res.json({
        success: true,
        user: {
          id:
            currentUser.id,

          email:
            currentUser.email,

          name:
            currentUser.name,

          createdAt:
            currentUser.createdAt,

          plan:
            currentUser.plan,

          creditsRemaining:
            currentUser.creditsRemaining,

          creditsUsed:
            currentUser.creditsUsed,

          creditsResetAt:
            currentUser.creditsResetAt,
        },
      });
    } catch (error) {
      console.error(
        "❌ GET CURRENT USER ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to verify your account right now.",
      });
    }
  }
);
// =====================================================
// USAGE
// =====================================================

app.get(
  "/api/usage",


  
  requireAuth,
  async (req, res) => {
    try {
      const user =
        await getUsageUser(
          req.user.id
        );

      return res.json({
        success: true,

        usage: {
          plan:
            getPlanName(user),

          creditsRemaining:
            user.creditsRemaining,

          creditsUsed:
            user.creditsUsed,

          creditsResetAt:
            user.creditsResetAt,

          costs: {
            adCopy:
              CREDIT_COSTS.adCopy,

            whatsapp:
              CREDIT_COSTS.whatsapp,

            flyer:
              CREDIT_COSTS.flyer,

            video:
              CREDIT_COSTS.video,
          },

          businessMonthlyCredits:
            BUSINESS_MONTHLY_CREDITS,

          freeCredits:
            FREE_CREDITS,
        },
      });
    } catch (error) {
      console.error(
        "❌ GET USAGE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to load your usage information.",
      });
    }
  }
);

// =====================================================
// LEGACY BUSINESS UPGRADE - DISABLED
// =====================================================

app.post(
  "/api/upgrade/business",
  requireAuth,
  async (req, res) => {
    return res.status(410).json({
      success: false,
      error:
        "Direct Business upgrades are disabled. Please use the Paystack checkout.",
    });
  }
);
// =====================================================
// DEV RESET TO FREE
// =====================================================

app.post(
  "/api/dev/reset-free",
  requireAuth,
  async (req, res) => {
    try {
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({
          success: false,
          error:
            "This development endpoint is disabled in production.",
        });
      }

      const updatedUsers = await db
        .update(users)
        .set({
          plan: "free",
          creditsRemaining: FREE_CREDITS,
          creditsUsed: 0,
          creditsResetAt: null,
        })
        .where(
          eq(users.id, req.user.id)
        )
        .returning({
          id: users.id,
          email: users.email,
          plan: users.plan,
          creditsRemaining:
            users.creditsRemaining,
          creditsUsed:
            users.creditsUsed,
          creditsResetAt:
            users.creditsResetAt,
        });

      if (updatedUsers.length === 0) {
        return res.status(404).json({
          success: false,
          error:
            "User account could not be found.",
        });
      }

      return res.json({
        success: true,
        message:
          "Development account reset to Free.",
        user: updatedUsers[0],
      });
    } catch (error) {
      console.error(
        "❌ DEV RESET FREE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to reset the development account.",
      });
    }
  }
);


// =====================================================
// BUSINESS PROFILE HELPERS
// =====================================================

async function findOrCreateBusiness(
  userId,
  businessData = {}
) {
  const existingBusinesses =
    await db
      .select()
      .from(businesses)
      .where(
        eq(
          businesses.userId,
          userId
        )
      )
      .limit(1);

  if (
    existingBusinesses.length > 0
  ) {
    return existingBusinesses[0];
  }

  const businessName =
    businessData.businessName?.trim();

  const category =
    businessData.category?.trim();

  const description =
    businessData.description?.trim();

  if (
    !businessName ||
    !category ||
    !description
  ) {
    return null;
  }

  const createdBusinesses =
    await db
      .insert(businesses)
      .values({
        userId,

        businessName,

        category,

        description,

        audience:
          businessData.audience?.trim() ||
          null,

        location:
          businessData.location?.trim() ||
          null,

        contact:
          businessData.contact?.trim() ||
          null,

        website:
          businessData.website?.trim() ||
          null,
      })
      .returning();

  return (
    createdBusinesses[0] ||
    null
  );
}

// =====================================================
// GET BUSINESS PROFILE
// =====================================================

app.get(
  "/api/business-profile",
  requireAuth,
  async (req, res) => {
    try {
      const foundBusinesses =
        await db
          .select()
          .from(businesses)
          .where(
            eq(
              businesses.userId,
              req.user.id
            )
          )
          .limit(1);

      if (
        foundBusinesses.length === 0
      ) {
        return res.json({
          success: true,
          business: null,
        });
      }

      return res.json({
        success: true,
        business:
          foundBusinesses[0],
      });
    } catch (error) {
      console.error(
        "❌ GET BUSINESS PROFILE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to load your business profile.",
      });
    }
  }
);

// =====================================================
// UPDATE BUSINESS PROFILE
// =====================================================

app.put(
  "/api/business-profile",
  requireAuth,
  async (req, res) => {
    try {
      const {
        businessName,
        category,
        description,
        audience,
        location,
        contact,
        website,
      } = req.body;

      const cleanBusinessName =
        typeof businessName === "string"
          ? businessName.trim()
          : "";

      const cleanCategory =
        typeof category === "string"
          ? category.trim()
          : "";

      const cleanDescription =
        typeof description === "string"
          ? description.trim()
          : "";

      if (
        !cleanBusinessName ||
        !cleanCategory ||
        !cleanDescription
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Business name, category and description are required.",
        });
      }

      const cleanAudience =
        typeof audience === "string"
          ? audience.trim()
          : null;

      const cleanLocation =
        typeof location === "string"
          ? location.trim()
          : null;

      const cleanContact =
        typeof contact === "string"
          ? contact.trim()
          : null;

      const cleanWebsite =
        typeof website === "string"
          ? website.trim()
          : null;

      const existingBusinesses =
        await db
          .select()
          .from(businesses)
          .where(
            eq(
              businesses.userId,
              req.user.id
            )
          )
          .limit(1);

      let business;

      if (
        existingBusinesses.length === 0
      ) {
        const createdBusinesses =
          await db
            .insert(businesses)
            .values({
              userId:
                req.user.id,

              businessName:
                cleanBusinessName,

              category:
                cleanCategory,

              description:
                cleanDescription,

              audience:
                cleanAudience,

              location:
                cleanLocation,

              contact:
                cleanContact,

              website:
                cleanWebsite,
            })
            .returning();

        business =
          createdBusinesses[0];
      } else {
        const updatedBusinesses =
          await db
            .update(businesses)
            .set({
              businessName:
                cleanBusinessName,

              category:
                cleanCategory,

              description:
                cleanDescription,

              audience:
                cleanAudience,

              location:
                cleanLocation,

              contact:
                cleanContact,

              website:
                cleanWebsite,
            })
            .where(
              eq(
                businesses.id,
                existingBusinesses[0].id
              )
            )
            .returning();

        business =
          updatedBusinesses[0];
      }

      return res.json({
        success: true,
        business,
        message:
          "Business profile saved successfully.",
      });
    } catch (error) {
      console.error(
        "❌ UPDATE BUSINESS PROFILE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to save your business profile.",
      });
    }
  }
);

// =====================================================
// GENERATE AI AD COPY
// =====================================================

app.post(
  "/api/generate-ad",
  requireAuth,
  async (req, res) => {
    let consumed = false;
    const creditCost =
      CREDIT_COSTS.adCopy;

    try {
      const {
        businessName,
        category,
        description,
        audience,
        location,
        offer,
        contact,
        website,
        adType,
        whatsappMode,
      } = req.body;

      if (
        !businessName ||
        !category ||
        !description
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Business name, category and description are required.",
        });
      }

      // -------------------------------------------------
      // WHATSAPP GENERATION
      // -------------------------------------------------

      const isWhatsApp =
        whatsappMode === true;

      const usage =
        await consumeCredits(
          req.user.id,
          creditCost
        );

      consumed = true;

      let prompt;

      if (isWhatsApp) {
        prompt = `
You are BizAd AI, an expert WhatsApp marketing copywriter.

Create high-converting WhatsApp marketing content for a small business.

BUSINESS INFORMATION:
Business Name: ${businessName}
Category: ${category}
Description: ${description}
Target Audience: ${audience || "General customers"}
Location: ${location || "Not specified"}
Offer: ${offer || "No specific offer provided"}
Contact: ${contact || "Not provided"}
Website: ${website || "Not provided"}

Create exactly these three pieces of content:

1. WHATSAPP STATUS
Write a short, attention-grabbing WhatsApp Status.
Keep it concise and natural.
Use a few appropriate emojis.

2. CUSTOMER BROADCAST
Write a friendly promotional WhatsApp message suitable for sending to customers.
Include a clear call to action.

3. PROMOTIONAL CAPTION
Write a short promotional caption suitable for social media or WhatsApp.

IMPORTANT:
- Sound natural and human.
- Do not mention that AI was used.
- Do not invent prices, discounts, addresses or claims.
- Only use information provided above.
- Avoid excessive emojis.
- Make the copy persuasive without sounding spammy.

Return the result in this exact format:

WHATSAPP STATUS:
[content]

CUSTOMER BROADCAST:
[content]

PROMOTIONAL CAPTION:
[content]
`;
      } else {
        prompt = `
You are BizAd AI, a professional advertising copywriter.

Create a polished advertising campaign for the following business.

BUSINESS NAME:
${businessName}

BUSINESS CATEGORY:
${category}

BUSINESS DESCRIPTION:
${description}

TARGET CUSTOMERS:
${audience || "General customers"}

LOCATION:
${location || "Not specified"}

OFFER:
${offer || "No specific offer provided"}

CONTACT:
${contact || "Not provided"}

WEBSITE:
${website || "Not provided"}

AD TYPE:
${adType || "Ad Copy"}

Create compelling advertising copy that is:
- Clear
- Professional
- Persuasive
- Natural
- Suitable for a real business
- Focused on customer benefits
- Appropriate for the target audience

Include:
1. A strong headline
2. A short promotional message
3. Key selling points
4. A clear call to action

Do not invent facts, prices, discounts, guarantees or business information that was not provided.

Return only the finished campaign copy.
`;
      }

      const completion =
        await client.chat.completions.create({
          model:
            "gpt-5.6-luna",

          messages: [
            {
              role: "system",
              content:
                "You are BizAd AI, a professional advertising assistant for small businesses.",
            },

            {
              role: "user",
              content:
                prompt,
            },
          ],
        });

      const generatedText =
        completion.choices?.[0]
          ?.message?.content
          ?.trim();

      if (!generatedText) {
        throw new Error(
          "The AI returned an empty response."
        );
      }

      return res.json({
        success: true,

        campaign:
          generatedText,

        usage: {
          plan:
            usage.plan,

          creditsRemaining:
            usage.creditsRemaining,

          creditsUsed:
            usage.creditsUsed,

          creditsResetAt:
            usage.creditsResetAt,

          creditCost,
        },
      });
    } catch (error) {
      console.error(
        "❌ AI AD GENERATION ERROR:",
        error
      );

      if (consumed) {
        try {
          await refundCredits(
            req.user.id,
            creditCost
          );
        } catch (
          refundError
        ) {
          console.error(
            "❌ CREDIT REFUND ERROR:",
            refundError
          );
        }
      }

      const usageError =
        sendUsageError(
          res,
          error
        );

      if (usageError) {
        return;
      }

      return res.status(500).json({
        success: false,
        error:
          getFriendlyError(
            error,
            "Unable to generate your ad copy right now."
          ),
      });
    }
  }
);

// =====================================================
// SAVE CAMPAIGN
// =====================================================

app.post(
  "/api/campaigns",
  requireAuth,
  async (req, res) => {
    try {
      const {
        businessName,
        category,
        description,
        audience,
        location,
        contact,
        website,
        adType,
        offer,
        campaignText,
        flyerImage,
        videoId,
        videoSeconds,
      } = req.body;

      if (
        !businessName ||
        !category ||
        !description ||
        !adType
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Business information and ad type are required.",
        });
      }

      const business =
        await findOrCreateBusiness(
          req.user.id,
          {
            businessName,
            category,
            description,
            audience,
            location,
            contact,
            website,
          }
        );

      if (!business) {
        return res.status(400).json({
          success: false,
          error:
            "Please complete your business profile before saving a campaign.",
        });
      }

      const createdCampaigns =
        await db
          .insert(campaigns)
          .values({
            userId:
              req.user.id,

            businessId:
              business.id,

            adType:
              adType.trim(),

            offer:
              offer?.trim() ||
              null,

            campaignText:
              campaignText ||
              null,

            flyerImage:
              flyerImage ||
              null,

            videoId:
              videoId ||
              null,

            videoSeconds:
              videoSeconds
                ? Number(videoSeconds)
                : null,
          })
          .returning();

      const savedCampaign =
        createdCampaigns[0];

      return res.status(201).json({
        success: true,

        campaign:
          savedCampaign,

        message:
          "Campaign saved successfully.",
      });
    } catch (error) {
      console.error(
        "❌ SAVE CAMPAIGN ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to save your campaign right now.",
      });
    }
  }
);

// =====================================================
// GET CAMPAIGNS
// =====================================================

app.get(
  "/api/campaigns",
  requireAuth,
  async (req, res) => {
    try {
      const userCampaigns =
        await db
          .select()
          .from(campaigns)
          .where(
            eq(
              campaigns.userId,
              req.user.id
            )
          )
          .orderBy(
            desc(
              campaigns.createdAt
            )
          );

      return res.json({
        success: true,

        campaigns:
          userCampaigns,
      });
    } catch (error) {
      console.error(
        "❌ GET CAMPAIGNS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to load your campaigns.",
      });
    }
  }
);

// =====================================================
// GET SINGLE CAMPAIGN
// =====================================================

app.get(
  "/api/campaigns/:id",
  requireAuth,
  async (req, res) => {
    try {
      const campaignId =
        Number(req.params.id);

      if (
        !Number.isInteger(
          campaignId
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid campaign ID.",
        });
      }

      const foundCampaigns =
        await db
          .select()
          .from(campaigns)
          .where(
            and(
              eq(
                campaigns.id,
                campaignId
              ),

              eq(
                campaigns.userId,
                req.user.id
              )
            )
          )
          .limit(1);

      if (
        foundCampaigns.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Campaign not found.",
        });
      }

      return res.json({
        success: true,

        campaign:
          foundCampaigns[0],
      });
    } catch (error) {
      console.error(
        "❌ GET CAMPAIGN ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to load this campaign.",
      });
    }
  }
);
// =====================================================
// UPDATE CAMPAIGN
// =====================================================

app.put(
  "/api/campaigns/:id",
  requireAuth,
  async (req, res) => {
    try {
      const campaignId =
        Number(req.params.id);

      if (
        !Number.isInteger(
          campaignId
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid campaign ID.",
        });
      }

      const {
        businessName,
        category,
        description,
        audience,
        location,
        contact,
        website,
        adType,
        offer,
        campaignText,
        flyerImage,
        videoId,
        videoSeconds,
      } = req.body;

      const existingCampaigns =
        await db
          .select()
          .from(campaigns)
          .where(
            and(
              eq(
                campaigns.id,
                campaignId
              ),
              eq(
                campaigns.userId,
                req.user.id
              )
            )
          )
          .limit(1);

      if (
        existingCampaigns.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Campaign not found.",
        });
      }

      const existingCampaign =
        existingCampaigns[0];

      let businessId =
        existingCampaign.businessId;

      if (
        businessName &&
        category &&
        description
      ) {
        const business =
          await findOrCreateBusiness(
            req.user.id,
            {
              businessName,
              category,
              description,
              audience,
              location,
              contact,
              website,
            }
          );

        if (business) {
          businessId =
            business.id;

          await db
            .update(businesses)
            .set({
              businessName:
                businessName.trim(),

              category:
                category.trim(),

              description:
                description.trim(),

              audience:
                audience?.trim() ||
                null,

              location:
                location?.trim() ||
                null,

              contact:
                contact?.trim() ||
                null,

              website:
                website?.trim() ||
                null,
            })
            .where(
              eq(
                businesses.id,
                business.id
              )
            );
        }
      }

      const updateData = {
        businessId,

        adType:
          adType !== undefined
            ? adType.trim()
            : existingCampaign.adType,

        offer:
          offer !== undefined
            ? offer?.trim() || null
            : existingCampaign.offer,

        campaignText:
          campaignText !== undefined
            ? campaignText
            : existingCampaign.campaignText,

        flyerImage:
          flyerImage !== undefined
            ? flyerImage
            : existingCampaign.flyerImage,

        videoId:
          videoId !== undefined
            ? videoId
            : existingCampaign.videoId,

        videoSeconds:
          videoSeconds !== undefined
            ? videoSeconds
              ? Number(videoSeconds)
              : null
            : existingCampaign.videoSeconds,
      };

      const updatedCampaigns =
        await db
          .update(campaigns)
          .set(updateData)
          .where(
            and(
              eq(
                campaigns.id,
                campaignId
              ),
              eq(
                campaigns.userId,
                req.user.id
              )
            )
          )
          .returning();

      return res.json({
        success: true,

        campaign:
          updatedCampaigns[0],

        message:
          "Campaign updated successfully.",
      });
    } catch (error) {
      console.error(
        "❌ UPDATE CAMPAIGN ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to update your campaign right now.",
      });
    }
  }
);

// =====================================================
// DELETE CAMPAIGN
// =====================================================

app.delete(
  "/api/campaigns/:id",
  requireAuth,
  async (req, res) => {
    try {
      const campaignId =
        Number(req.params.id);

      if (
        !Number.isInteger(
          campaignId
        )
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Invalid campaign ID.",
        });
      }

      const deletedCampaigns =
        await db
          .delete(campaigns)
          .where(
            and(
              eq(
                campaigns.id,
                campaignId
              ),
              eq(
                campaigns.userId,
                req.user.id
              )
            )
          )
          .returning();

      if (
        deletedCampaigns.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Campaign not found.",
        });
      }

      return res.json({
        success: true,

        campaign:
          deletedCampaigns[0],

        message:
          "Campaign deleted successfully.",
      });
    } catch (error) {
      console.error(
        "❌ DELETE CAMPAIGN ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to delete your campaign right now.",
      });
    }
  }
);

// =====================================================
// GENERATE FLYER
// =====================================================

app.post(
  "/api/generate-flyer",
  requireAuth,
  async (req, res) => {
    let consumed = false;

    const creditCost =
      CREDIT_COSTS.flyer;

    try {
      const {
        businessName,
        category,
        description,
        audience,
        location,
        offer,
        contact,
        website,
      } = req.body;

      if (
        !businessName ||
        !category ||
        !description
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Business name, category and description are required.",
        });
      }

      const usage =
        await consumeCredits(
          req.user.id,
          creditCost
        );

      consumed = true;

      const flyerPrompt = `
Create a professional promotional flyer for this business.

Business name:
${businessName}

Business category:
${category}

Business description:
${description}

Target customers:
${audience || "General customers"}

Location:
${location || "Not specified"}

Offer:
${offer || "No specific offer provided"}

Contact:
${contact || "Not provided"}

Website:
${website || "Not provided"}

Design requirements:

- Modern professional advertising flyer
- Strong visual hierarchy
- Attractive typography
- Clean commercial layout
- Make the business name prominent
- Clearly communicate the offer if one was provided
- Include the contact information if provided
- Include the website if provided
- Suitable for social media advertising
- High-quality realistic commercial design
- Do not invent business information
- Do not add fake prices or discounts
- Do not include unrelated logos or brands
`;

      const result =
        await client.images.generate({
          model:
            "gpt-image-2",

          prompt:
            flyerPrompt,

          size:
            "1024x1024",

          quality:
            "high",
        });

      const imageData =
        result?.data?.[0]?.b64_json;

      if (!imageData) {
        throw new Error(
          "The AI did not return a flyer image."
        );
      }

      return res.json({
        success: true,

        image:
          `data:image/png;base64,${imageData}`,

        usage: {
          plan:
            usage.plan,

          creditsRemaining:
            usage.creditsRemaining,

          creditsUsed:
            usage.creditsUsed,

          creditsResetAt:
            usage.creditsResetAt,

          creditCost,
        },
      });
    } catch (error) {
      console.error(
        "❌ FLYER GENERATION ERROR:",
        error
      );

      if (consumed) {
        try {
          await refundCredits(
            req.user.id,
            creditCost
          );
        } catch (
          refundError
        ) {
          console.error(
            "❌ FLYER CREDIT REFUND ERROR:",
            refundError
          );
        }
      }

      const usageError =
        sendUsageError(
          res,
          error
        );

      if (usageError) {
        return;
      }

      return res.status(500).json({
        success: false,
        error:
          getFriendlyError(
            error,
            "Unable to generate your flyer right now."
          ),
      });
    }
  }
);

// =====================================================
// GENERATE AI VIDEO
// =====================================================

app.post(
  "/api/generate-video",
  requireAuth,
  async (req, res) => {
    let consumed = false;

    const creditCost =
      CREDIT_COSTS.video;

    try {
      const user =
        await getUsageUser(
          req.user.id
        );

      // Business plan only
      if (
        getPlanName(user) !==
        "business"
      ) {
        return res.status(403).json({
          success: false,
          code: "BUSINESS_ONLY",
          error:
            "AI Video is available on the Business plan only.",
        });
      }

      const {
        businessName,
        category,
        description,
        audience,
        location,
        offer,
        contact,
        website,
      } = req.body;

      if (
        !businessName ||
        !category ||
        !description
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Business name, category and description are required.",
        });
      }

      // =================================================
      // MOCK MODE
      // No external video API call
      // No credits charged
      // =================================================

      if (VIDEO_MODE === "mock") {
        const videoId =
          `mock_${req.user.id}_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        mockVideoJobs.set(
          videoId,
          {
            id: videoId,
            userId: req.user.id,
            createdAt: Date.now(),
            status: "processing",
            progress: 5,
            seconds:
              Number(VIDEO_DURATION),
            url: MOCK_VIDEO_URL,
            businessName,
          }
        );

        console.log(
          `🎬 Mock video started: ${videoId}`
        );

        return res.json({
          success: true,
          mode: "mock",
          videoId,
          status: "processing",
          progress: 5,
          seconds:
            Number(VIDEO_DURATION),
          actualSeconds:
            Number(VIDEO_DURATION),

          usage: {
            plan:
              getPlanName(user),

            creditsRemaining:
              user.creditsRemaining,

            creditsUsed:
              user.creditsUsed,

            creditsResetAt:
              user.creditsResetAt,

            // Mock video costs nothing.
            creditCost: 0,
          },
        });
      }

      // =================================================
      // LIVE VIDEO SAFETY SWITCH
      // =================================================

      if (
        VIDEO_MODE !== "live" ||
        !ENABLE_BILLABLE_VIDEO
      ) {
        return res.status(503).json({
          success: false,
          error:
            "Live AI video generation is currently disabled.",
        });
      }

      // =================================================
      // LIVE MODE
      // Credits are charged only after both safety
      // switches explicitly allow billable generation.
      // =================================================

      const usage =
        await consumeCredits(
          req.user.id,
          creditCost
        );

      consumed = true;

      const videoPrompt = `
Create a professional vertical promotional advertisement video for this business.

Business:
${businessName}

Category:
${category}

Description:
${description}

Target audience:
${audience || "General customers"}

Location:
${location || "Not specified"}

Offer:
${offer || "No specific offer provided"}

Contact:
${contact || "Not provided"}

Website:
${website || "Not provided"}

Create a polished commercial suitable for social media platforms.

Style:
- Modern
- Professional
- Engaging
- Premium commercial quality
- Strong opening visual
- Clear product/service focus
- Natural movement
- Attractive composition
- Suitable for mobile viewing

Do not invent prices, discounts, claims, locations or contact information.
Do not include unrelated brands or logos.
`;

      const video =
        await client.videos.create({
          model: "sora-2",
          prompt: videoPrompt,
          seconds:
            VIDEO_DURATION,
          size:
            VIDEO_SIZE,
        });

      const videoId =
        video?.id;

      if (!videoId) {
        throw new Error(
          "The video service did not return a video ID."
        );
      }

      return res.json({
        success: true,
        mode: "live",
        videoId,
        seconds:
          Number(VIDEO_DURATION),
        actualSeconds:
          Number(VIDEO_DURATION),

        usage: {
          plan:
            usage.plan,

          creditsRemaining:
            usage.creditsRemaining,

          creditsUsed:
            usage.creditsUsed,

          creditsResetAt:
            usage.creditsResetAt,

          creditCost,
        },
      });
    } catch (error) {
      console.error(
        "❌ VIDEO GENERATION ERROR:",
        error
      );

      // Refund only if a LIVE request
      // actually consumed credits.
      if (consumed) {
        try {
          await refundCredits(
            req.user.id,
            creditCost
          );
        } catch (refundError) {
          console.error(
            "❌ VIDEO CREDIT REFUND ERROR:",
            refundError
          );
        }
      }

      const usageError =
        sendUsageError(
          res,
          error
        );

      if (usageError) {
        return;
      }

      return res.status(500).json({
        success: false,
        error:
          getFriendlyError(
            error,
            "Unable to start your AI video generation right now."
          ),
      });
    }
  }
);
// =====================================================
// VIDEO STATUS
// =====================================================

app.get(
  "/api/videos/:id/status",
  requireAuth,
  async (req, res) => {
    try {
      const videoId =
        req.params.id;

      if (!videoId) {
        return res.status(400).json({
          success: false,
          error:
            "Video ID is required.",
        });
      }

      // =================================================
      // MOCK VIDEO STATUS
      // =================================================

      if (
        videoId.startsWith("mock_")
      ) {
        const job =
          mockVideoJobs.get(videoId);

        if (
          !job ||
          job.userId !== req.user.id
        ) {
          return res.status(404).json({
            success: false,
            error:
              "Mock video job could not be found.",
          });
        }

        const elapsedSeconds =
          (Date.now() -
            job.createdAt) /
          1000;

        const progress =
          Math.min(
            100,
            Math.floor(
              5 +
                elapsedSeconds * 8
            )
          );

        const status =
          progress >= 100
            ? "completed"
            : "processing";

        job.progress = progress;
        job.status = status;

        mockVideoJobs.set(
          videoId,
          job
        );

        return res.json({
          success: true,
          mode: "mock",
          videoId,
          status,
          progress,
          seconds:
            Number(VIDEO_DURATION),
          error: null,
        });
      }

      // =================================================
      // LIVE VIDEO STATUS
      // =================================================

      if (
        VIDEO_MODE !== "live" ||
        !ENABLE_BILLABLE_VIDEO
      ) {
        return res.status(503).json({
          success: false,
          error:
            "Live AI video generation is currently disabled.",
        });
      }

      const video =
        await client.videos.retrieve(
          videoId
        );

      return res.json({
        success: true,
        mode: "live",
        videoId:
          video.id,
        status:
          video.status,
        progress:
          video.progress ?? 0,
        seconds:
          Number(VIDEO_DURATION),
        error:
          video.error || null,
      });
    } catch (error) {
      console.error(
        "❌ VIDEO STATUS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          getFriendlyError(
            error,
            "Unable to check video status."
          ),
      });
    }
  }
);

// =====================================================
// VIDEO STREAM
// =====================================================

app.get(
  "/api/videos/:id/stream",
  requireAuth,
  async (req, res) => {
    try {
      const videoId =
        req.params.id;

      if (!videoId) {
        return res.status(400).json({
          success: false,
          error:
            "Video ID is required.",
        });
      }

      // =================================================
      // MOCK VIDEO STREAM
      // =================================================

      if (
        videoId.startsWith("mock_")
      ) {
        const job =
          mockVideoJobs.get(videoId);

        if (
          !job ||
          job.userId !== req.user.id
        ) {
          return res.status(404).json({
            success: false,
            error:
              "Mock video could not be found.",
          });
        }

        if (
          job.status !== "completed"
        ) {
          return res.status(409).json({
            success: false,
            error:
              "Mock video is still being prepared.",
          });
        }

        return res.redirect(
          job.url || MOCK_VIDEO_URL
        );
      }

      // =================================================
      // LIVE VIDEO STREAM
      // =================================================

      if (
        VIDEO_MODE !== "live" ||
        !ENABLE_BILLABLE_VIDEO
      ) {
        return res.status(503).json({
          success: false,
          error:
            "Live AI video generation is currently disabled.",
        });
      }

      const videoResponse =
        await client.videos.downloadContent(
          videoId
        );

      const body =
        videoResponse?.body;

      if (!body) {
        return res.status(404).json({
          success: false,
          error:
            "Video content is not available yet.",
        });
      }

      res.setHeader(
        "Content-Type",
        "video/mp4"
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      if (
        typeof body.pipe ===
        "function"
      ) {
        body.pipe(res);
        return;
      }

      if (
        body instanceof ReadableStream
      ) {
        const reader =
          body.getReader();

        while (true) {
          const {
            done,
            value,
          } =
            await reader.read();

          if (done) {
            break;
          }

          res.write(
            Buffer.from(value)
          );
        }

        res.end();
        return;
      }

      if (
        Buffer.isBuffer(body)
      ) {
        res.end(body);
        return;
      }

      return res.status(500).json({
        success: false,
        error:
          "Unable to stream the generated video.",
      });
    } catch (error) {
      console.error(
        "❌ VIDEO STREAM ERROR:",
        error
      );

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error:
            getFriendlyError(
              error,
              "Unable to stream the generated video."
            ),
        });
      }

      res.end();
    }
  }
);
// =====================================================
// VIDEO DOWNLOAD
// =====================================================

app.get(
  "/api/videos/:id/download",
  requireAuth,
  async (req, res) => {
    try {
      const videoId =
        req.params.id;

      if (!videoId) {
        return res.status(400).json({
          success: false,
          error:
            "Video ID is required.",
        });
      }

      // =================================================
      // MOCK VIDEO DOWNLOAD
      // =================================================

      if (
        videoId.startsWith("mock_")
      ) {
        const job =
          mockVideoJobs.get(videoId);

        if (
          !job ||
          job.userId !== req.user.id
        ) {
          return res.status(404).json({
            success: false,
            error:
              "Mock video could not be found.",
          });
        }

        if (
          job.status !== "completed"
        ) {
          return res.status(409).json({
            success: false,
            error:
              "Mock video is still being prepared.",
          });
        }

       res.setHeader(
  "Cache-Control",
  "no-store"
);

return res.download(
  "public/bizad-demo.mp4",
  `bizad-ai-${videoId}.mp4`
);
}
      // =================================================
      // LIVE VIDEO DOWNLOAD
      // =================================================

      if (
        VIDEO_MODE !== "live" ||
        !ENABLE_BILLABLE_VIDEO
      ) {
        return res.status(503).json({
          success: false,
          error:
            "Live AI video generation is currently disabled.",
        });
      }

      const videoResponse =
        await client.videos.downloadContent(
          videoId
        );

      const body =
        videoResponse?.body;

      if (!body) {
        return res.status(404).json({
          success: false,
          error:
            "Video content is not available yet.",
        });
      }

      res.setHeader(
        "Content-Type",
        "video/mp4"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="bizad-ai-${videoId}.mp4"`
      );

      if (
        typeof body.pipe ===
        "function"
      ) {
        body.pipe(res);
        return;
      }

      if (
        body instanceof ReadableStream
      ) {
        const reader =
          body.getReader();

        while (true) {
          const {
            done,
            value,
          } =
            await reader.read();

          if (done) {
            break;
          }

          res.write(
            Buffer.from(value)
          );
        }

        res.end();
        return;
      }

      if (
        Buffer.isBuffer(body)
      ) {
        res.end(body);
        return;
      }

      return res.status(500).json({
        success: false,
        error:
          "Unable to download the generated video.",
      });
    } catch (error) {
      console.error(
        "❌ VIDEO DOWNLOAD ERROR:",
        error
      );

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error:
            getFriendlyError(
              error,
              "Unable to download the generated video."
            ),
        });
      }

      res.end();
    }
  }
);
// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
  "/api/health",
  async (req, res) => {
    try {
      return res.json({
        success: true,
        message: "BizAd AI server is running.",
        database: "enabled",
        authentication: "enabled",
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: "Server health check failed.",
      });
    }
  }
);

// =====================================================
// ROOT
// =====================================================

app.get(
  "/",
  (req, res) => {
    res.json({
      success: true,
      message:
        "BizAd AI API is running.",
      version: "1.0.0",
    });
  }
);


// =====================================================
// PAYSTACK - INITIALIZE BUSINESS SUBSCRIPTION
// =====================================================

app.post(
  "/api/payments/initialize-business",
  requireAuth,
  async (req, res) => {
    try {
      const paystackSecretKey =
        process.env.PAYSTACK_SECRET_KEY;

      const paystackPlanCode =
        process.env.PAYSTACK_PLAN_CODE;

      const callbackUrl =
        process.env.PAYSTACK_CALLBACK_URL;

      if (
        !paystackSecretKey ||
        !paystackPlanCode ||
        !callbackUrl
      ) {
        console.error(
          "Paystack environment variables are missing."
        );

        return res.status(500).json({
          success: false,
          error:
            "Payment configuration is incomplete.",
        });
      }

      const [localUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.id))
        .limit(1);

      if (!localUser) {
        return res.status(404).json({
          success: false,
          error: "BizAd user not found.",
        });
      }

      if (localUser.plan === "business") {
        return res.status(400).json({
          success: false,
          error:
            "Your account is already on the Business plan.",
        });
      }

      const reference =
        `bizad-${localUser.id}-${Date.now()}`;

      const paystackResponse = await fetch(
        "https://api.paystack.co/transaction/initialize",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${paystackSecretKey}`,

            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            email: localUser.email,

            // Paystack requires amount.
            // The subscription plan amount takes precedence.
            amount: "1990000",

            currency: "NGN",

            plan: paystackPlanCode,

            reference,

            callback_url: callbackUrl,

            metadata: JSON.stringify({
              bizadUserId: localUser.id,
              purpose:
                "bizad_business_subscription",
            }),
          }),
        }
      );

      const paystackData =
        await paystackResponse.json();

      if (
        !paystackResponse.ok ||
        !paystackData.status
      ) {
        console.error(
          "Paystack initialization failed:",
          paystackData
        );

        return res.status(502).json({
          success: false,
          error:
            paystackData.message ||
            "Unable to initialize payment.",
        });
      }

      return res.json({
        success: true,

        authorizationUrl:
          paystackData.data.authorization_url,

        accessCode:
          paystackData.data.access_code,

        reference:
          paystackData.data.reference,
      });
    } catch (error) {
      console.error(
        "Initialize Business payment error:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to initialize Business payment.",
      });
    }
  }
);

// =====================================================
// PAYSTACK - VERIFY BUSINESS PAYMENT
// =====================================================

app.post(
  "/api/payments/verify-business",
  requireAuth,
  async (req, res) => {
    try {
      const { reference } = req.body;

      if (
        typeof reference !== "string" ||
        !reference.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "Payment reference is required.",
        });
      }

      const cleanReference =
        reference.trim();

      // The reference was created by BizAd for this user.
      const expectedPrefix =
        `bizad-${req.user.id}-`;

      if (
        !cleanReference.startsWith(
          expectedPrefix
        )
      ) {
        return res.status(403).json({
          success: false,
          error:
            "This payment does not belong to your BizAd account.",
        });
      }

      const paystackSecretKey =
        process.env.PAYSTACK_SECRET_KEY;

      if (!paystackSecretKey) {
        return res.status(500).json({
          success: false,
          error:
            "Payment configuration is incomplete.",
        });
      }

      const verifyResponse =
        await fetch(
          `https://api.paystack.co/transaction/verify/${encodeURIComponent(
            cleanReference
          )}`,
          {
            method: "GET",
            headers: {
              Authorization:
                `Bearer ${paystackSecretKey}`,
            },
          }
        );

      const verifyData =
        await verifyResponse.json();

      if (
        !verifyResponse.ok ||
        !verifyData.status
      ) {
        console.error(
          "Paystack verification failed:",
          verifyData
        );

        return res.status(502).json({
          success: false,
          error:
            verifyData.message ||
            "Unable to verify payment.",
        });
      }

      const transaction =
        verifyData.data;

      // IMPORTANT:
      // Paystack API success is not the same
      // as transaction payment success.
      if (
        transaction.status !== "success"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "The payment has not been completed successfully.",
        });
      }

      if (
        Number(transaction.amount) !==
        1990000
      ) {
        return res.status(400).json({
          success: false,
          error:
            "The payment amount is incorrect.",
        });
      }

      if (
        transaction.currency !== "NGN"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "The payment currency is incorrect.",
        });
      }

      const customerEmail =
        transaction.customer?.email
          ?.trim()
          .toLowerCase();

      if (
        customerEmail !==
        req.user.email
          .trim()
          .toLowerCase()
      ) {
        return res.status(403).json({
          success: false,
          error:
            "The payment email does not match your BizAd account.",
        });
      }

      let metadata =
        transaction.metadata;

      if (
        typeof metadata === "string" &&
        metadata
      ) {
        try {
          metadata =
            JSON.parse(metadata);
        } catch {
          metadata = {};
        }
      }

      if (
        String(metadata?.bizadUserId) !==
          String(req.user.id) ||
        metadata?.purpose !==
          "bizad_business_subscription"
      ) {
        return res.status(403).json({
          success: false,
          error:
            "The payment could not be matched to this BizAd upgrade.",
        });
      }

      const currentUsers =
        await db
          .select()
          .from(users)
          .where(
            eq(
              users.id,
              req.user.id
            )
          )
          .limit(1);

      if (
        currentUsers.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "BizAd account could not be found.",
        });
      }

      // Do not reset credits again if this
      // transaction is verified more than once.
      if (
        currentUsers[0].plan ===
        "business"
      ) {
        return res.json({
          success: true,
          message:
            "Your Business plan is already active.",
          user:
            currentUsers[0],
        });
      }

      const nextResetAt =
        new Date();

      nextResetAt.setMonth(
        nextResetAt.getMonth() + 1
      );

      const updatedUsers =
        await db
          .update(users)
          .set({
            plan: "business",

            creditsRemaining:
              BUSINESS_MONTHLY_CREDITS,

            creditsUsed: 0,

            creditsResetAt:
              nextResetAt,
          })
          .where(
            eq(
              users.id,
              req.user.id
            )
          )
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            plan: users.plan,
            creditsRemaining:
              users.creditsRemaining,
            creditsUsed:
              users.creditsUsed,
            creditsResetAt:
              users.creditsResetAt,
          });
       
       // Persist the verified payment as a fallback in case
// the Paystack webhook was delayed or unavailable.
await db
  .insert(payments)
  .values({
    userId: req.user.id,
    reference: cleanReference,
    event: "transaction.verify",
    status: "success",
    amount: Number(transaction.amount),
    currency: transaction.currency,

    paystackCustomerCode:
      transaction.customer?.customer_code || null,

    paystackSubscriptionCode:
      transaction.subscription?.subscription_code || null,
  })
  .onConflictDoNothing({
    target: payments.reference,
  });

      return res.json({
        success: true,
        message:
          "Payment verified. Your Business plan is now active.",
        user:
          updatedUsers[0],
      });
    } catch (error) {
      console.error(
        "❌ PAYSTACK VERIFY ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "Unable to verify your Business payment.",
      });
    }
  }
);

// =====================================================
// PAYSTACK WEBHOOK
// =====================================================

app.post(
  "/api/payments/paystack-webhook",
  async (req, res) => {
    try {
      const paystackSecretKey =
        process.env.PAYSTACK_SECRET_KEY;

      const signature =
        req.headers["x-paystack-signature"];

      if (
        !paystackSecretKey ||
        !signature ||
        !req.rawBody
      ) {
        return res.status(401).json({
          success: false,
          error:
            "Invalid Paystack webhook.",
        });
      }

      const expectedSignature =
        crypto
          .createHmac(
            "sha512",
            paystackSecretKey
          )
          .update(req.rawBody)
          .digest("hex");

      const receivedBuffer =
        Buffer.from(
          String(signature),
          "hex"
        );

      const expectedBuffer =
        Buffer.from(
          expectedSignature,
          "hex"
        );

      const signatureIsValid =
        receivedBuffer.length ===
          expectedBuffer.length &&
        crypto.timingSafeEqual(
          receivedBuffer,
          expectedBuffer
        );

      if (!signatureIsValid) {
        console.warn(
          "⚠️ Invalid Paystack webhook signature"
        );

        return res.status(401).json({
          success: false,
          error:
            "Invalid webhook signature.",
        });
      }

      const event = req.body;

      console.log("");
      console.log(
        "======================================"
      );
      console.log(
        "💳 PAYSTACK WEBHOOK RECEIVED"
      );
      console.log(
        "Event:",
        event?.event
      );
      console.log(
        "======================================"
      );
      console.log("");

      // =====================================================
// INITIAL BUSINESS PAYMENT - CHARGE SUCCESS
// =====================================================

if (event?.event === "charge.success") {
  const data = event.data;

  const reference =
    data?.reference;

  if (
    typeof reference !== "string" ||
    !reference.startsWith("bizad-")
  ) {
    return res.sendStatus(200);
  }

  if (
    data?.status !== "success" ||
    Number(data?.amount) !== 1990000 ||
    data?.currency !== "NGN"
  ) {
    console.warn(
      "⚠️ Ignoring unexpected BizAd charge.success event."
    );

    return res.sendStatus(200);
  }

  let metadata =
    data?.metadata;

  if (
    typeof metadata === "string" &&
    metadata
  ) {
    try {
      metadata =
        JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }

  const bizadUserId =
    Number(metadata?.bizadUserId);

  if (
    !Number.isInteger(bizadUserId) ||
    metadata?.purpose !==
      "bizad_business_subscription"
  ) {
    console.warn(
      "⚠️ Charge success metadata does not match BizAd Business."
    );

    return res.sendStatus(200);
  }

  const foundUsers =
    await db
      .select()
      .from(users)
      .where(
        eq(
          users.id,
          bizadUserId
        )
      )
      .limit(1);

  if (
    foundUsers.length === 0
  ) {
    console.warn(
      "⚠️ BizAd user not found for successful Paystack charge:",
      bizadUserId
    );

    return res.sendStatus(200);
  }

  const user =
    foundUsers[0];

  const customerEmail =
    data.customer?.email
      ?.trim()
      .toLowerCase();

  if (
    !customerEmail ||
    customerEmail !==
      user.email.trim().toLowerCase()
  ) {
    console.warn(
      "⚠️ Paystack customer email does not match BizAd user."
    );

    return res.sendStatus(200);
  }


// Check whether this Paystack transaction
// has already been fully processed.
const existingPayments =
  await db
    .select({
      id: payments.id,
    })
    .from(payments)
    .where(
      eq(
        payments.reference,
        reference
      )
    )
    .limit(1);

if (existingPayments.length > 0) {
  console.log(
    "ℹ️ Paystack payment already processed:",
    reference
  );

  // Do not return yet.
  // The payment may already be recorded while the
  // subscription code is still waiting to be saved.
}
if (
  existingPayments.length === 0 &&
  getPlanName(user) !== "business"
) {
  const nextResetAt =
    new Date();

  nextResetAt.setMonth(
    nextResetAt.getMonth() + 1
  );

  await db
    .update(users)
    .set({
      plan: "business",

      creditsRemaining:
        BUSINESS_MONTHLY_CREDITS,

      creditsUsed: 0,

      creditsResetAt:
        nextResetAt,
    })
    .where(
      eq(
        users.id,
        user.id
      )
    );
    await db
  .update(payments)
  .set({
    subscriptionStatus:
      "active",

    subscriptionEndsAt:
      nextPaymentDate,
  })
  .where(
    eq(
      payments.paystackSubscriptionCode,
      subscriptionCode
    )
  );

  console.log(
    "✅ Business activated by Paystack webhook:",
    user.email
  );
} else {
  console.log(
    "ℹ️ Business already active:",
    user.email
  );
}

// Record the payment only after the account
// has successfully reached the Business state.
if (existingPayments.length === 0) {
  await db
    .insert(payments)
    .values({
      userId: user.id,
      reference,
      event: "charge.success",
      status: "success",
      amount: Number(data.amount),
      currency: data.currency,

      paystackCustomerCode:
        data.customer?.customer_code || null,

      paystackSubscriptionCode:
        data.subscription?.subscription_code || null,
    })
    .onConflictDoNothing({
      target: payments.reference,
    });

  console.log(
    "✅ Paystack payment recorded:",
    reference
  );
}


// =====================================================
// SAVE PAYSTACK SUBSCRIPTION DETAILS
// =====================================================

try {
  const customerLookup =
    data.customer?.customer_code ||
    customerEmail;

  const customerResponse =
    await fetch(
      `https://api.paystack.co/customer/${encodeURIComponent(
        customerLookup
      )}`,
      {
        method: "GET",
        headers: {
          Authorization:
            `Bearer ${paystackSecretKey}`,
        },
      }
    );

  const customerData =
    await customerResponse.json();

  if (
    customerResponse.ok &&
    customerData.status
  ) {
    const subscriptions =
      Array.isArray(
        customerData.data?.subscriptions
      )
        ? customerData.data.subscriptions
        : [];

    const activeSubscriptions =
      subscriptions
        .filter(
          (subscription) =>
            subscription?.status ===
              "active" &&
            Number(
              subscription?.amount
            ) === 1990000
        )
        .sort(
          (a, b) =>
            new Date(
              b.createdAt || 0
            ).getTime() -
            new Date(
              a.createdAt || 0
            ).getTime()
        );

    const activeSubscription =
      activeSubscriptions[0];

    if (
      activeSubscription?.subscription_code
    ) {
      await db
        .update(payments)
        .set({
  paystackCustomerCode:
    data.customer?.customer_code ||
    customerData.data?.customer_code ||
    null,

  paystackSubscriptionCode:
    activeSubscription.subscription_code,

  subscriptionStatus:
    "active",

  subscriptionEndsAt:
    activeSubscription.next_payment_date
      ? new Date(
          activeSubscription.next_payment_date
        )
      : null,
})
        .where(
          eq(
            payments.reference,
            reference
          )
        );

      console.log(
        "✅ Paystack subscription saved:",
        activeSubscription.subscription_code
      );
    } else {
      console.warn(
        "⚠️ No active Paystack Business subscription found yet."
      );
    }
  } else {
    console.warn(
      "⚠️ Unable to fetch Paystack customer subscription."
    );
  }
} catch (subscriptionError) {
  console.error(
    "❌ PAYSTACK SUBSCRIPTION LOOKUP ERROR:",
    subscriptionError
  );
}
}
      // =====================================================
     // SUCCESSFUL BUSINESS SUBSCRIPTION RENEWAL
    // =====================================================

if (event?.event === "invoice.update") {
  const data = event.data;

  const paymentSucceeded =
    data?.status === "success" &&
    data?.paid === true &&
    data?.transaction?.status === "success";

  if (!paymentSucceeded) {
    return res.sendStatus(200);
  }

  if (
    Number(data.amount) !== 1990000 ||
    data.transaction?.currency !== "NGN"
  ) {
    console.warn(
      "⚠️ Ignoring invoice with unexpected amount or currency."
    );

    return res.sendStatus(200);
  }

 const subscriptionCode =
  data.subscription?.subscription_code ||
  data.subscription_code;

if (!subscriptionCode) {
  console.warn(
    "⚠️ Paystack renewal has no subscription code."
  );

  return res.sendStatus(200);
}

// Match the renewal to the subscription
// BizAd stored during the original payment.
const matchingPayments =
  await db
    .select({
      userId: payments.userId,
    })
    .from(payments)
    .where(
      eq(
        payments.paystackSubscriptionCode,
        subscriptionCode
      )
    )
    .orderBy(
      desc(payments.processedAt)
    )
    .limit(1);

if (matchingPayments.length === 0) {
  console.warn(
    "⚠️ No BizAd payment found for Paystack subscription:",
    subscriptionCode
  );

  return res.sendStatus(200);
}

const foundUsers =
  await db
    .select()
    .from(users)
    .where(
      eq(
        users.id,
        matchingPayments[0].userId
      )
    )
    .limit(1);

if (foundUsers.length === 0) {
  console.warn(
    "⚠️ No BizAd user found for Paystack subscription:",
    subscriptionCode
  );

  return res.sendStatus(200);
}

const user =
  foundUsers[0];

const customerEmail =
  user.email.trim().toLowerCase();

// Secondary safety check:
// if Paystack supplies an email, it must still
// match the BizAd account tied to the subscription.
const eventCustomerEmail =
  data.customer?.email
    ?.trim()
    .toLowerCase();

if (
  eventCustomerEmail &&
  eventCustomerEmail !== customerEmail
) {
  console.warn(
    "⚠️ Paystack renewal email does not match stored subscription owner."
  );

  return res.sendStatus(200);
}

  const nextPaymentDate =
    data.subscription?.next_payment_date
      ? new Date(
          data.subscription.next_payment_date
        )
      : null;

  if (
    !nextPaymentDate ||
    Number.isNaN(
      nextPaymentDate.getTime()
    )
  ) {
    console.warn(
      "⚠️ Paystack renewal has no valid next payment date."
    );

    return res.sendStatus(200);
  }

  const existingResetAt =
    user.creditsResetAt
      ? new Date(user.creditsResetAt)
      : null;

  // Paystack may retry webhook delivery.
  // If this billing period was already processed,
  // do not restore the user's credits again.
  if (
    existingResetAt &&
    existingResetAt >= nextPaymentDate
  ) {
    console.log(
      "ℹ️ Renewal already processed for:",
      customerEmail
    );

    return res.sendStatus(200);
  }

  await db
    .update(users)
    .set({
      plan: "business",

      creditsRemaining:
        BUSINESS_MONTHLY_CREDITS,

      creditsUsed: 0,

      creditsResetAt:
        nextPaymentDate,
    })
    .where(
      eq(
        users.id,
        user.id
      )
    );

  console.log(
    "✅ Business subscription renewed:",
    customerEmail
  );

  console.log(
    "Next renewal:",
    nextPaymentDate
  );
}

// =====================================================
// SUBSCRIPTION WILL NOT RENEW
// =====================================================

if (
  event?.event ===
  "subscription.not_renew"
) {
  const data =
    event.data;

  const subscriptionCode =
    data?.subscription_code ||
    data?.subscription?.subscription_code;

  if (!subscriptionCode) {
    console.warn(
      "⚠️ Non-renewing subscription event has no subscription code."
    );

    return res.sendStatus(200);
  }

  const nextPaymentDate =
    data?.next_payment_date
      ? new Date(
          data.next_payment_date
        )
      : data?.subscription?.next_payment_date
        ? new Date(
            data.subscription.next_payment_date
          )
        : null;

  const validEndsAt =
    nextPaymentDate &&
    !Number.isNaN(
      nextPaymentDate.getTime()
    )
      ? nextPaymentDate
      : null;

  await db
    .update(payments)
    .set({
      subscriptionStatus:
        "non-renewing",

      subscriptionEndsAt:
        validEndsAt,
    })
    .where(
      eq(
        payments.paystackSubscriptionCode,
        subscriptionCode
      )
    );

  console.log(
    "⏳ Business subscription set to non-renewing:",
    subscriptionCode
  );

  console.log(
    "Access ends:",
    validEndsAt
  );
}

// =====================================================
// FAILED / CANCELLED BUSINESS SUBSCRIPTION
// =====================================================

if (
  event?.event === "invoice.payment_failed" ||
  event?.event === "subscription.disable"
) {
 const data =
  event.data;

const subscriptionCode =
  data?.subscription?.subscription_code ||
  data?.subscription_code;

if (!subscriptionCode) {
  console.warn(
    "?? Paystack subscription event has no subscription code."
  );

  return res.sendStatus(200);
}

const matchingPayments =
  await db
    .select({
      userId: payments.userId,
    })
    .from(payments)
    .where(
      eq(
        payments.paystackSubscriptionCode,
        subscriptionCode
      )
    )
    .orderBy(
      desc(payments.processedAt)
    )
    .limit(1);

if (matchingPayments.length === 0) {
  console.warn(
    "?? No BizAd payment found for Paystack subscription:",
    subscriptionCode
  );

  return res.sendStatus(200);
}

const foundUsers =
  await db
    .select()
    .from(users)
    .where(
      eq(
        users.id,
        matchingPayments[0].userId
      )
    )
    .limit(1);

if (foundUsers.length === 0) {
  console.warn(
    "?? No BizAd user found for Paystack subscription:",
    subscriptionCode
  );

  return res.sendStatus(200);
}

const user =
  foundUsers[0];

const customerEmail =
  user.email.trim().toLowerCase();

const eventCustomerEmail =
  data.customer?.email
    ?.trim()
    .toLowerCase();

if (
  eventCustomerEmail &&
  eventCustomerEmail !== customerEmail
) {
  console.warn(
    "?? Paystack subscription email does not match stored subscription owner."
  );

  return res.sendStatus(200);
}

  if (
    getPlanName(user) !==
    "business"
  ) {
    return res.sendStatus(200);
  }

  // Do not grant fresh free credits on downgrade.
  // Preserve only up to the Free plan allowance.
  const freeCreditsRemaining =
    Math.max(
      0,
      Math.min(
        Number(
          user.creditsRemaining || 0
        ),
        FREE_CREDITS
      )
    );

  const freeCreditsUsed =
    Math.max(
      0,
      FREE_CREDITS -
        freeCreditsRemaining
    );

  await db
    .update(users)
    .set({
      plan: "free",

      creditsRemaining:
        freeCreditsRemaining,

      creditsUsed:
        freeCreditsUsed,

      creditsResetAt:
        null,
    })
    .where(
      eq(
        users.id,
        user.id
      )
    );

    await db
  .update(payments)
  .set({
    subscriptionStatus:
      event.event === "subscription.disable"
        ? "disabled"
        : "payment-failed",

    subscriptionEndsAt:
      new Date(),
  })
  .where(
    eq(
      payments.paystackSubscriptionCode,
      subscriptionCode
    )
  );

  console.log(
    "⬇️ Business subscription ended:",
    customerEmail
  );

  console.log(
    "Reason:",
    event.event
  );
}


return res.sendStatus(200);
    } catch (error) {
      console.error(
        "❌ PAYSTACK WEBHOOK ERROR:",
        error
      );

      return res.sendStatus(500);
    }
  }
);

// =====================================================
// 404 HANDLER
// =====================================================

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,
      error:
        "The requested endpoint was not found.",
    });
  }
);

// =====================================================
// GLOBAL ERROR HANDLER
// =====================================================

app.use(
  (error, req, res, next) => {
    console.error(
      "❌ UNHANDLED SERVER ERROR:",
      error
    );

    if (res.headersSent) {
      return next(error);
    }

    return res.status(500).json({
      success: false,
      error:
        "An unexpected server error occurred.",
    });
  }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(
  PORT,
  () => {
    console.log("");
    console.log(
      "======================================"
    );
    console.log(
      "🤖 BIZAD AI SERVER RUNNING"
    );
    console.log(
      "======================================"
    );
    console.log(
      `🌐 http://localhost:${PORT}`
    );
    console.log(
      `🎬 Video duration: ${VIDEO_DURATION} seconds`
    );
    console.log(
      `📱 Video size: ${VIDEO_SIZE}`
    );
    console.log(
      "🗄️ Database: enabled"
    );
    console.log(
      "🔐 Authentication: enabled"
    );
    console.log(
      "💳 Credit system: enabled"
    );
    console.log(
      `🆓 Free credits: ${FREE_CREDITS}`
    );
    console.log(
      `💼 Business monthly credits: ${BUSINESS_MONTHLY_CREDITS}`
    );
    console.log(
      "======================================"
    );
    console.log("");
  }
);
