import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const base =
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium " +
  "transition-[transform,opacity] duration-150 ease-out " +
  "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  // soft yellow glow on hover and focus; only its opacity animates
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-full " +
  "before:shadow-[0_0_24px_rgba(245,183,0,0.35)] before:opacity-0 before:transition-opacity before:duration-150 " +
  "hover:before:opacity-100 focus-visible:before:opacity-100";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-marking-400 text-asphalt-950",
  secondary: "border border-chalk-50 text-chalk-50",
  ghost: "text-chalk-50 before:hidden",
};

/** Class list for anything that should look like a button, such as a Next.js `<Link>`. */
export function buttonClasses(variant: ButtonVariant = "primary", className = ""): string {
  return `${base} ${variants[variant]} ${className}`.trim();
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
