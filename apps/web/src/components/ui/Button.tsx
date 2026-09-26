import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "dark" | "outline" | "ghost" | "light";
type Size = "sm" | "md" | "lg";

type BaseProps = {
  children: React.ReactNode;
  variant?: Variant;
  size?: Size;
  arrow?: boolean;
  className?: string;
};

type LinkProps = BaseProps & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps | "href"> & { href: string };
type ActionProps = BaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps> & { href?: undefined };

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white shadow-glow hover:bg-primary-strong",
  dark: "bg-ink text-white hover:bg-ink-2",
  outline: "border border-ink/12 bg-white text-ink hover:border-primary/40 hover:text-primary",
  ghost: "text-ink/70 hover:bg-mist hover:text-ink",
  light: "bg-white text-ink hover:bg-mist",
};

const sizes: Record<Size, string> = {
  // max-md: 44px on touch screens.
  sm: "h-9 rounded-lg px-3.5 text-[13px] max-md:h-11",
  md: "h-11 rounded-lg px-5 text-sm",
  lg: "h-13 rounded-lg px-6 text-[15px]",
};

export function Button(props: LinkProps | ActionProps) {
  const { children, variant = "primary", size = "md", arrow = false, className, ...rest } = props;
  const classes = cn(
    "group inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap transition duration-200 active:scale-[.97] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary/70",
    variants[variant],
    sizes[size],
    className,
  );
  const content = (
    <>
      {children}
      {arrow && <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />}
    </>
  );

  if (typeof rest.href === "string") {
    // Everything else (onClick, aria-*, target, rel…) reaches the link too; it
    // used to be dropped, so a link-style button silently ignored onClick.
    const { href, ...linkProps } = rest as LinkProps;
    return (
      <Link href={href} className={classes} {...linkProps}>
        {content}
      </Link>
    );
  }

  const { type = "button", ...buttonProps } = rest as ActionProps;
  return (
    <button type={type} className={classes} {...buttonProps}>
      {content}
    </button>
  );
}
