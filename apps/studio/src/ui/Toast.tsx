import { CircleAlert, CircleCheck, PartyPopper, X } from "lucide-react";
import { Toast as RToast } from "radix-ui";
import { cx } from "./cx";
import "./Toast.css";
import { type ToastItem, useToastStore } from "./toast-store";

const ICONS = {
  neutral: null,
  success: <CircleCheck />,
  danger: <CircleAlert />,
  celebrate: <PartyPopper />,
} as const;

function ToastView({ t }: { t: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <RToast.Root
      className={cx("st-toast", `st-toast--${t.tone}`)}
      duration={t.duration}
      onOpenChange={(open) => !open && dismiss(t.id)}
      type={t.tone === "danger" ? "foreground" : "background"}
    >
      {ICONS[t.tone] && <span className="st-toast__icon">{ICONS[t.tone]}</span>}
      <div className="st-toast__text">
        <RToast.Title className="st-toast__title">{t.title}</RToast.Title>
        {t.description && (
          <RToast.Description className="st-toast__desc">{t.description}</RToast.Description>
        )}
      </div>
      {t.action && (
        <RToast.Action
          altText={t.action.label}
          asChild
          onClick={(e) => {
            t.action?.onClick();
            if (t.action?.keepOpen) e.preventDefault();
          }}
        >
          <button type="button" className="st-toast__action">
            {t.action.label}
          </button>
        </RToast.Action>
      )}
      <RToast.Close className="st-toast__close" aria-label="Dismiss">
        <X />
      </RToast.Close>
    </RToast.Root>
  );
}

/** Mount once near the app root. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <RToast.Provider swipeDirection="down" label="Notifications">
      {toasts.map((t) => (
        <ToastView key={t.id} t={t} />
      ))}
      <RToast.Viewport className="st-toast-viewport" />
    </RToast.Provider>
  );
}
