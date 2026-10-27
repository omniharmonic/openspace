export const name = "@omniharmonic/openspace-email-render";

export { EmailRenderError, type EmailWarning } from "./diag";
export { esc, safeUrl } from "./escape";
export {
  EMAIL_WIDTH,
  type RenderEmailInput,
  type RenderedEmail,
  renderEmail,
  unsubscribeHeaders,
} from "./layout";
export {
  type CampaignEmailInput,
  type ConfirmSubscriptionInput,
  campaignEmail,
  confirmSubscriptionEmail,
  currencyExponent,
  type EmailResult,
  type FormNotificationInput,
  formNotificationEmail,
  type MagicLinkInput,
  magicLinkEmail,
  type OrderReceiptInput,
  orderReceiptEmail,
} from "./templates";
export { buildEmailTheme, type EmailPalette, type EmailTheme } from "./theme";
