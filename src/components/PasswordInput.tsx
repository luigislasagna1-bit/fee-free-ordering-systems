"use client";
/**
 * Password input with a show/hide eye toggle (Fabrizio cms0gyexp #6).
 *
 * Shared so every password field renders the same control — customer login/
 * signup/reset use it today; the staff/marketplace forms are a follow-up
 * migration. Styling is passed through via className (each form keeps its own
 * border/focus look); the component only appends the padding the icons need.
 *
 * Uses Tailwind LOGICAL utilities (ps/pe/start/end) so the toggle sits at the
 * text-end in RTL locales (ar/he) without extra work. aria-label is localized
 * via common.showPassword / common.hidePassword (×38).
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Lock } from "lucide-react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Renders the little Lock icon at the start (reset-password style). */
  withLockIcon?: boolean;
};

export function PasswordInput({ withLockIcon, className, ...rest }: Props) {
  const t = useTranslations("common");
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      {withLockIcon && (
        <Lock className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      )}
      <input
        type={show ? "text" : "password"}
        className={`${className ?? ""} pe-10${withLockIcon ? " ps-9" : ""}`}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? t("hidePassword") : t("showPassword")}
        className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
