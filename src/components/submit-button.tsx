"use client";

import { useFormStatus } from "react-dom";

/**
 * Drop-in replacement for a <button type="submit"> inside a <form>.
 * Reads the parent form's pending state via useFormStatus: shows "Saving…"
 * while the action runs, uses aria-disabled (not disabled) so focus is
 * never dropped, and blocks a double-submit via onClick.
 *
 * Must be rendered as a direct or indirect child of the <form> it belongs to.
 * Buttons that use the `form="id"` attribute association cannot use this
 * component — useFormStatus reads the ancestor form, not the id attribute.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className,
  name,
  value,
  form,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  name?: string;
  value?: string;
  /** Associates the button with a form by id. Note: useFormStatus reads the
   *  ancestor form element, not the form= association, so pending state only
   *  works when the button is rendered inside the <form> tag. */
  form?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      form={form}
      aria-disabled={pending}
      className={className}
      onClick={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
