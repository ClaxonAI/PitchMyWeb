import type { DentalServiceIcon, PreviewTemplateCode } from "@pitchmyweb/templates";

// Hand-drawn 24px line icons, one visual family (1.5px stroke, round caps).

const TOOTH =
  "M7.2 3.2c-2.3 0-4 1.8-4 4.2 0 2.2.8 3.7 1.5 5.2.7 1.6 1 3.4 1.3 5.4.3 1.9.9 2.9 1.8 2.9 1.3 0 1.6-1.8 2-3.6.3-1.4.8-2.4 2.2-2.4s1.9 1 2.2 2.4c.4 1.8.7 3.6 2 3.6.9 0 1.5-1 1.8-2.9.3-2 .6-3.8 1.3-5.4.7-1.5 1.5-3 1.5-5.2 0-2.4-1.7-4.2-4-4.2-1.8 0-2.8 1.1-4.8 1.1S9 3.2 7.2 3.2Z";

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

const paths: Record<DentalServiceIcon, React.ReactNode> = {
  checkup: (
    <>
      <path d={TOOTH} />
      <path d="m9.3 9.4 1.9 1.9 3.6-3.6" />
    </>
  ),
  whitening: (
    <>
      <path d={TOOTH} />
      <path d="M19.5 1.5v2.5M18.25 2.75h2.5M2.5 16v2M1.5 17h2" />
    </>
  ),
  implant: (
    <>
      <path d="M6.5 3.5c-1.7 0-3 1.3-3 3 0 1.9 1.4 3 3 3h11c1.6 0 3-1.1 3-3 0-1.7-1.3-3-3-3-1.4 0-2.3.8-5.5.8S7.9 3.5 6.5 3.5Z" />
      <path d="M12 9.5v11M9.5 12h5M10 15h4M10.5 18h3" />
    </>
  ),
  braces: (
    <>
      <path d="M3 9.5c0-2 1.3-3.5 3-3.5s2.2 1.2 3 1.2S10.3 6 12 6s2.2 1.2 3 1.2S16.3 6 18 6s3 1.5 3 3.5c0 3-1.5 4.5-2 8-.3 1.5-.8 2.5-1.6 2.5-1.3 0-1.4-2.5-2.4-2.5S13.3 20 12 20s-1.4-2.5-3-2.5S7.9 20 6.6 20c-.8 0-1.3-1-1.6-2.5-.5-3.5-2-5-2-8Z" />
      <path d="M3.5 11.5h17" />
      <rect x="6" y="10.25" width="2.5" height="2.5" rx=".6" />
      <rect x="10.75" y="10.25" width="2.5" height="2.5" rx=".6" />
      <rect x="15.5" y="10.25" width="2.5" height="2.5" rx=".6" />
    </>
  ),
  rootcanal: (
    <>
      <path d={TOOTH} />
      <path d="M12 7.5v4M10 11.5c-.3 1.5-.7 2.7-1.3 3.8M14 11.5c.3 1.5.7 2.7 1.3 3.8" />
    </>
  ),
  filling: (
    <>
      <path d={TOOTH} />
      <circle cx="12" cy="9" r="2.2" />
    </>
  ),
  crown: (
    <>
      <path d="m3.5 8 3.2 3 5.3-6.5 5.3 6.5 3.2-3-1.8 10.5H5.3L3.5 8Z" />
      <path d="M5.5 21h13" />
    </>
  ),
  kids: (
    <>
      <circle cx="12" cy="12.5" r="8.5" />
      <path d="M8.5 14.5c.9 1.4 2.1 2.1 3.5 2.1s2.6-.7 3.5-2.1" />
      <path d="M9 10.3h.01M15 10.3h.01" strokeWidth={2.2} />
      <path d="M12 4c.3-1.2 1.2-2 2.5-2" />
    </>
  ),
  extraction: (
    <>
      <path d="M7.2 9.2c-2.3 0-4 1.8-4 4.2 0 2.2.8 3.7 1.5 5.2.5 1.2.8 2.2 1 2.9M16.8 9.2c2.3 0 4 1.8 4 4.2 0 2.2-.8 3.7-1.5 5.2-.5 1.2-.8 2.2-1 2.9M7.2 9.2c1.8 0 2.8 1.1 4.8 1.1s3-1.1 4.8-1.1" />
      <path d="M12 7V1.8M9.8 4 12 1.8 14.2 4" />
    </>
  ),
  gum: (
    <>
      <path d="M7.2 3.2c-2.3 0-4 1.8-4 4.2 0 2 .7 3.4 1.3 4.8h15c.6-1.4 1.3-2.8 1.3-4.8 0-2.4-1.7-4.2-4-4.2-1.8 0-2.8 1.1-4.8 1.1S9 3.2 7.2 3.2Z" />
      <path d="M2.5 15c1.6 0 1.6 1.5 3.2 1.5S7.3 15 8.9 15s1.6 1.5 3.1 1.5S13.6 15 15.2 15s1.6 1.5 3.1 1.5 1.6-1.5 3.2-1.5M4.5 19.5c1.3 0 1.3 1.2 2.6 1.2s1.3-1.2 2.6-1.2 1.3 1.2 2.5 1.2 1.3-1.2 2.6-1.2 1.3 1.2 2.6 1.2 1.3-1.2 2.6-1.2" />
    </>
  ),
  emergency: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v9M7.5 12h9" />
    </>
  ),
  smile: (
    <>
      <path d="M3 9c2.6 5.5 5.6 8 9 8s6.4-2.5 9-8" />
      <path d="M5.5 10.7c2 .6 4.2.9 6.5.9s4.5-.3 6.5-.9M8.5 11.4v2.4M12 11.6v3M15.5 11.4v2.4" />
    </>
  ),
  generic: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8M12 8v8" />
    </>
  ),
};

export function ServiceIcon({ icon, className }: IconProps & { icon: DentalServiceIcon }) {
  return <Svg className={className}>{paths[icon]}</Svg>;
}

export function ToothMark({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d={TOOTH} />
      <path d="M9.5 7.6c.8.5 1.6.7 2.5.7" />
    </Svg>
  );
}

export function BrandMark({ mark, className }: IconProps & { mark: PreviewTemplateCode }) {
  if (mark === "dental-clinic") return <ToothMark className={className} />;
  const glyphs: Record<Exclude<PreviewTemplateCode, "dental-clinic">, React.ReactNode> = {
    clinic: (
      <>
        <path d="M8 4h8v4H8z" />
        <path d="M5 8h14v12H5z" />
        <path d="M12 8v12M5 14h14" />
      </>
    ),
    restaurant: (
      <>
        <path d="M8 3v10M6 3c0 3 2 3 2 6M10 3c0 3-2 3-2 6" />
        <path d="M16 3v18M14 3h4v6c0 2-4 2-4 0V3Z" />
      </>
    ),
    salon: (
      <>
        <circle cx="8" cy="7" r="3" />
        <circle cx="16" cy="7" r="3" />
        <path d="M8 10c0 4 4 6 4 11M16 10c0 4-4 6-4 11" />
      </>
    ),
    gym: (
      <>
        <path d="M7 9v6M17 9v6M4 10.5v3M20 10.5v3M7 12h10" />
      </>
    ),
    interiors: (
      <>
        <path d="M4 20V10l8-6 8 6v10" />
        <path d="M10 20v-6h4v6" />
      </>
    ),
    event: (
      <>
        <path d="M5 8h14v12H5z" />
        <path d="M5 12h14M9 5v4M15 5v4" />
      </>
    ),
    coaching: (
      <>
        <path d="M4 7h16v11H4z" />
        <path d="M8 7V5h8v2M12 11v4" />
      </>
    ),
  };
  return <Svg className={className}>{glyphs[mark]}</Svg>;
}

export function WhatsAppIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.87 9.87 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.84 9.84 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.11.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.25 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.16.04-.31-.02-.43-.06-.13-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6.6 3.5h-2a1.5 1.5 0 0 0-1.5 1.6c.6 8.2 7.6 15.2 15.8 15.8a1.5 1.5 0 0 0 1.6-1.5v-2c0-.7-.5-1.3-1.2-1.4l-3-.6c-.6-.1-1.1.1-1.5.6l-1 1.3a12.3 12.3 0 0 1-5.5-5.5l1.3-1c.5-.4.7-.9.6-1.5l-.6-3c-.1-.7-.7-1.2-1.4-1.2Z" />
    </Svg>
  );
}

export function PinIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="m12 2.8 2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.6 6.4 19.8l1.3-6.2L3 9.3l6.3-.7L12 2.8Z" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function ArrowIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}
