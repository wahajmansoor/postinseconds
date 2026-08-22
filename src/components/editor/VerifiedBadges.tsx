import { Cancel01Icon } from "hugeicons-react";
import type { SVGProps } from "react";

type BadgeProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

// 1. LinkedIn Shield Verified
export function LinkedInVerifiedBadge({ size = 16, className, ...props }: BadgeProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      fillOpacity=".9"
      aria-hidden="true"
      data-supported-dps="16x16"
      className={className}
      aria-label="LinkedIn Verified"
      {...props}
    >
      <path d="m8 15-.86-.29C3.24 13.41 1 10.62 1 7V2.49L8 0l7 2.49V7c0 3.62-2.23 6.41-6.13 7.71zM3 3.9V7c0 3.53 2.6 5.09 4.78 5.82l.23.08.23-.08C10.01 12.23 13 10.71 13 7V3.9L8 2.11zM9.43 5 7.01 8.02l-1.1-1.1L4.5 8.34l2.67 2.67 4.83-6H9.43z" />
    </svg>
  );
}

// 2. Facebook / Meta Verified
export function MetaVerifiedBadge({ size = 16, className, ...props }: BadgeProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 12 13"
      fill="none"
      className={className}
      aria-label="Meta Verified"
      {...props}
    >
      <path
        fill="#0866FF"
        fillRule="evenodd"
        d="m8.853 5.354-3.5 3.5a.5.5 0 0 1-.706 0l-1.5-1.5a.5.5 0 1 1 .706-.708L5 7.793l3.147-3.147a.5.5 0 1 1 .706.708m3.078 2.295L11.342 6.5l.588-1.15a.633.633 0 0 0-.219-.82l-1.085-.7-.065-1.287a.627.627 0 0 0-.6-.603l-1.29-.066L7.968.787a.636.636 0 0 0-.82-.217L6 1.158 4.85.57a.63.63 0 0 0-.82.22l-.701 1.085-1.289.065a.626.626 0 0 0-.6.6l-.066 1.29-1.088.702a.634.634 0 0 0-.216.82l.588 1.149-.588 1.15a.63.63 0 0 0 .219.819l1.085.701.065 1.286c.014.33.274.59.6.604l1.29.065.703 1.088c.177.27.53.362.82.216L6 11.842l1.15.589a.633.633 0 0 0 .82-.22l.701-1.085 1.286-.064a.627.627 0 0 0 .604-.601l.065-1.29 1.088-.703a.633.633 0 0 0 .216-.819"
      />
    </svg>
  );
}

// 3. Twitter / X Verified
export function TwitterVerifiedBadge({ size = 22, className, ...props }: BadgeProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      className={className}
      aria-label="X Verified"
      {...props}
    >
      <path
        fill="#1D9BF0"
        d="M20.396 11a3.49 3.49 0 0 0-2.008-3.062 3.47 3.47 0 0 0-.742-3.584 3.474 3.474 0 0 0-3.584-.742A3.47 3.47 0 0 0 11 1.604a3.46 3.46 0 0 0-3.053 2.008 3.47 3.47 0 0 0-1.902-.14c-.635.13-1.22.436-1.69.882a3.461 3.461 0 0 0-.734 3.584A3.49 3.49 0 0 0 1.604 11a3.496 3.496 0 0 0 2.017 3.062 3.471 3.471 0 0 0 .733 3.584 3.49 3.49 0 0 0 3.584.742A3.49 3.49 0 0 0 11 20.396a3.48 3.48 0 0 0 3.062-2.007 3.335 3.335 0 0 0 4.326-4.327A3.49 3.49 0 0 0 20.396 11M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
      />
    </svg>
  );
}

// 4. Instagram Verified
export function InstagramVerifiedBadge({ size = 22, className, ...props }: BadgeProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      aria-label="Instagram Verified"
      {...props}
    >
      <path
        fill="#0095F6"
        fillRule="evenodd"
        d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581z"
      />
    </svg>
  );
}

// List of badges matching s.verified index [0: None, 1: LinkedIn, 2: Meta, 3: X/Twitter, 4: Instagram]
export const VERIFIED_CANVAS_BADGES = [
  null,
  LinkedInVerifiedBadge,
  MetaVerifiedBadge,
  TwitterVerifiedBadge,
  InstagramVerifiedBadge,
];

// Picker list with icons for LeftPanel
export const VERIFIED_PICKER_ICONS = [
  Cancel01Icon,
  LinkedInVerifiedBadge,
  MetaVerifiedBadge,
  TwitterVerifiedBadge,
  InstagramVerifiedBadge,
];
