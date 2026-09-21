"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = {
  name: string;
  label: string;
  autoComplete: string;
  minLength?: number;
  maxLength?: number;
  hint?: string;
};

export function PasswordField({
  name,
  label,
  autoComplete,
  minLength,
  maxLength,
  hint,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <label htmlFor={name}>{label}</label>
      <span className="password-control">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((value) => !value)}
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {hint && <small>{hint}</small>}
    </div>
  );
}
