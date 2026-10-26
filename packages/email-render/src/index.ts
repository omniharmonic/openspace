export const name = "@openspace/email-render";

export { renderBlocks } from "./blocks";
export { esc, safeUrl } from "./escape";
export { EMAIL_WIDTH, type RenderEmailInput, type RenderedEmail, renderEmail } from "./layout";
export {
  type CampaignEmailInput,
  type ConfirmSubscriptionInput,
  campaignEmail,
  confirmSubscriptionEmail,
  type EmailResult,
  type FormNotificationInput,
  formNotificationEmail,
  type MagicLinkInput,
  magicLinkEmail,
  type OrderReceiptInput,
  orderReceiptEmail,
} from "./templates";
export { buildEmailTheme, type EmailPalette, type EmailTheme } from "./theme";
