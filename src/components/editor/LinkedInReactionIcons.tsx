// LinkedIn's own reaction icons (Like, Celebrate, Support, ...) and action-
// bar glyphs (the plain monochrome Like/Comment/Repost/Send icons) — used
// in PostPreviewDialog. Transcribed from LinkedIn's actual SVGs (obfuscated
// build class names and data-* tracking attributes stripped, hyphenated
// SVG attributes converted to JSX's camelCase).
type ReactionIconProps = {
  size?: number;
  className?: string;
};

// The small "in" logo badge LinkedIn shows next to a post author's name to
// mark the post as published on LinkedIn itself (vs. a cross-posted link).
export function LinkedInBugIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M15 2v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1M5 6H3v7h2zm.25-2A1.25 1.25 0 1 0 4 5.25 1.25 1.25 0 0 0 5.25 4M13 9.29c0-2.2-.73-3.49-2.86-3.49A2.71 2.71 0 0 0 7.89 7V6H6v7h2V9.73a1.73 1.73 0 0 1 1.54-1.92h.12C10.82 7.8 11 8.94 11 9.73V13h2z" />
    </svg>
  );
}

// The action bar's own Like glyph in its default (no reaction picked yet)
// state — monochrome, fills with currentColor so it follows the button's
// own text color like the other action icons do.
export function LinkedInLikeOutlineIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="m12.91 7-2.25-2.57a8.2 8.2 0 0 1-1.5-2.55L9 1.37A2.08 2.08 0 0 0 7 0a2.08 2.08 0 0 0-2.06 2.08v1.17a5.8 5.8 0 0 0 .31 1.89l.28.86H2.38A1.47 1.47 0 0 0 1 7.47a1.45 1.45 0 0 0 .64 1.21 1.48 1.48 0 0 0-.37 2.06 1.54 1.54 0 0 0 .62.51h.05a1.6 1.6 0 0 0-.19.71A1.47 1.47 0 0 0 3 13.42v.1A1.46 1.46 0 0 0 4.4 15h4.83a5.6 5.6 0 0 0 2.48-.58l1-.42H14V7zM12 12.11l-1.19.52a3.6 3.6 0 0 1-1.58.37H5.1a.55.55 0 0 1-.53-.4l-.14-.48-.49-.21a.56.56 0 0 1-.34-.6l.09-.56-.42-.42a.56.56 0 0 1-.09-.68L3.55 9l-.4-.61A.28.28 0 0 1 3.3 8h5L7.14 4.51a4.2 4.2 0 0 1-.2-1.26V2.08A.09.09 0 0 1 7 2a.1.1 0 0 1 .08 0l.18.51a10 10 0 0 0 1.9 3.24l2.84 3z" />
    </svg>
  );
}

export function LinkedInCommentOutlineIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 8h5v1H5zm11-.5v.08a6 6 0 0 1-2.75 5L8 16v-3H5.5A5.51 5.51 0 0 1 0 7.5 5.62 5.62 0 0 1 5.74 2h4.76A5.5 5.5 0 0 1 16 7.5m-2 0A3.5 3.5 0 0 0 10.5 4H5.74A3.62 3.62 0 0 0 2 7.5 3.53 3.53 0 0 0 5.5 11H10v1.33l2.17-1.39A4 4 0 0 0 14 7.58zM5 7h6V6H5z" />
    </svg>
  );
}

export function LinkedInRepostOutlineIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 10H2V5c0-1.66 1.34-3 3-3h3.85L7.42 0h2.44L12 3 9.86 6H7.42l1.43-2H5c-.55 0-1 .45-1 1zm8-4v5c0 .55-.45 1-1 1H7.15l1.43-2H6.14L4 13l2.14 3h2.44l-1.43-2H11c1.66 0 3-1.34 3-3V6z" />
    </svg>
  );
}

export function LinkedInSendOutlineIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M14 2 0 6.67l5 2.64 5.67-3.98L6.7 11l2.63 5z" />
    </svg>
  );
}

export function LinkedInLikeIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="7.5" fill="#378fe9" />
      <path
        fill="#fff"
        d="M8 1a7 7 0 1 1-7 7 7 7 0 0 1 7-7m0-1a8 8 0 1 0 5.66 2.34A8 8 0 0 0 8 0"
      />
      <path
        fill="#d0e8ff"
        fillRule="evenodd"
        d="M11.93 7.25h-.55c-.05 0-.15-.19-.4-.46-.37-.4-.78-.91-1.07-1.19a7.1 7.1 0 0 1-1.73-2.24c-.24-.51-.26-.74-.75-.74a.78.78 0 0 0-.67.81c0 .14.07.63.1.8a7.5 7.5 0 0 0 1 2.2H4.12a.88.88 0 0 0-.65.28.84.84 0 0 0-.23.66.91.91 0 0 0 .93.85h.16a.82.82 0 0 0-.55.24.77.77 0 0 0-.21.54.81.81 0 0 0 .74.8.8.8 0 0 0 .33 1.42.76.76 0 0 0-.09.55.87.87 0 0 0 .85.63h2.29a3.8 3.8 0 0 0 .89-.11l1.42-.4h1.9c1.02-.04 1.29-4.64.03-4.64"
      />
      <path fill="none" d="M7.3 3.72a6.4 6.4 0 0 0 1.15 2.71M5.94 11.9h2.18a16 16 0 0 0 1.9-.54h1.36" />
      <path
        fill="none"
        stroke="#004182"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.43 6.43H4.11a.88.88 0 0 0-.88 1 .92.92 0 0 0 .93.84h.16a.82.82 0 0 0-.55.24.77.77 0 0 0-.21.56.83.83 0 0 0 .74.81.81.81 0 0 0-.31.63.81.81 0 0 0 .65.8.78.78 0 0 0-.09.56.86.86 0 0 0 .85.62h2.29a3.8 3.8 0 0 0 .89-.11l1.42-.47h1.9c1 0 1.27-4.64 0-4.64a5 5 0 0 1-.55 0s-.15-.19-.4-.46h0c-.37-.4-.78-.91-1.07-1.19a7.1 7.1 0 0 1-1.7-2.25 2.1 2.1 0 0 0-.32-.52.83.83 0 0 0-1.16.09 1.4 1.4 0 0 0-.25.38 1.7 1.7 0 0 0-.09.3 2.4 2.4 0 0 0 .07.84 4 4 0 0 0 .27.84 6.7 6.7 0 0 0 .66 1 .2.2 0 0 1 .07.08"
      />
    </svg>
  );
}

export function LinkedInCelebrateIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
    >
      <path
        fill="#fff"
        d="M8 1a7 7 0 1 1-7 7 7 7 0 0 1 7-7m0-1a8 8 0 1 0 5.66 2.34A8 8 0 0 0 8 0"
      />
      <g clipPath="circle(7)">
        <path fill="#d8d8d8" d="M8 1a7 7 0 0 1 7 7 7 7 0 0 1-7 7 7 7 0 0 1-7-7 7 7 0 0 1 7-7" />
        <circle cx="8" cy="8" r="7.5" fill="#6dae4f" />
        <path
          fill="#fff"
          d="M8 1a7 7 0 1 1-7 7 7 7 0 0 1 7-7m0-1a8 8 0 1 0 5.66 2.34A8 8 0 0 0 8 0"
        />
        <path
          fill="none"
          stroke="#165209"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M12.13 9.22a9.2 9.2 0 0 0-.36-2.32A4.3 4.3 0 0 1 10.44 5c-.16-.53-.27-.72-.74-.73a.74.74 0 0 0-.65.8c0 .24 0 .49.06.72a11.5 11.5 0 0 0 .58 1.92l-4.5-3.38a.75.75 0 0 0-1.11.07.73.73 0 0 0 .27 1L6.6 7.1l.59.56L3.62 5a.71.71 0 0 0-.75-.16.69.69 0 0 0-.46.61.71.71 0 0 0 .36.67L5 7.77l1.35 1-2.9-2.19a.8.8 0 0 0-.57-.21.8.8 0 0 0-.54.28c-.31.4-.06.81.26 1.06L4.85 9.4l1.15.85-2.27-1.7a.74.74 0 0 0-1.09 0 .76.76 0 0 0 .24 1.09l4.1 3c.6.45 2.07.84 2.72.27"
        />
        <path
          fill="#dcf0cb"
          fillRule="evenodd"
          d="m12.61 9.9-.42-.37a6.7 6.7 0 0 0-.51-2.14A5.7 5.7 0 0 1 10.47 5c-.16-.53-.27-.72-.74-.73a.74.74 0 0 0-.65.8c0 .24 0 .49.06.72a9 9 0 0 0 .55 1.84l-.19-.1-4.31-3.31a.75.75 0 0 0-1.11.07.73.73 0 0 0-.1.59.71.71 0 0 0 .37.47L6.55 7l.64.51-3.57-2.67a.74.74 0 0 0-.57-.21.77.77 0 0 0-.54.27.77.77 0 0 0-.1.59.74.74 0 0 0 .36.51L5 7.66l1.35 1-2.9-2.18a.75.75 0 0 0-.57-.22.76.76 0 0 0-.54.28.73.73 0 0 0 .26 1.06l2.25 1.69 1.15.85-2.27-1.69a.73.73 0 0 0-.54-.25.77.77 0 0 0-.55.25.74.74 0 0 0 .24 1.08L7 12.64a2.68 2.68 0 0 0 2.08.51 1.15 1.15 0 0 0 1.41 0c.6-.46.41-.51.85-1.13a11 11 0 0 0 1.27-2.12"
        />
        <path
          fill="none"
          stroke="#165209"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth=".5"
          d="M12.13 9.22a9.2 9.2 0 0 0-.36-2.32A4.3 4.3 0 0 1 10.44 5c-.16-.53-.27-.72-.74-.73a.74.74 0 0 0-.65.8c0 .24 0 .49.06.72a11.5 11.5 0 0 0 .58 1.92l-4.5-3.38a.75.75 0 0 0-1.11.07.73.73 0 0 0 .27 1L6.6 7.1l.59.56L3.62 5a.71.71 0 0 0-.75-.16.69.69 0 0 0-.46.61.71.71 0 0 0 .36.67L5 7.77l1.35 1-2.9-2.19a.8.8 0 0 0-.57-.21.8.8 0 0 0-.54.28c-.31.4-.06.81.26 1.06L4.85 9.4l1.15.85-2.27-1.7a.74.74 0 0 0-1.09 0 .76.76 0 0 0 .24 1.09l4.1 3a4.48 4.48 0 0 0 2.72.62"
        />
        <path
          fill="none"
          stroke="#165209"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M14.77 11.39a2.2 2.2 0 0 1-.46-.75 3.7 3.7 0 0 0-.1-.65 2.4 2.4 0 0 0-.36-1.08 5.85 5.85 0 0 1-1.21-2.38c-.16-.53-.27-.72-.74-.73a.74.74 0 0 0-.5.26.73.73 0 0 0-.15.54 4.4 4.4 0 0 0 .06.72c.18.92.37 1.68.39 1.73L7.41 5.84a.76.76 0 0 0-.57-.22.72.72 0 0 0-.54.29.73.73 0 0 0 .26 1l2.25 1.7.68.56-3.6-2.71a.76.76 0 0 0-.57-.22A.71.71 0 0 0 5 7.58l2.25 1.7 1.35 1-2.89-2.19a.73.73 0 0 0-1.1.08c-.31.4-.07.81.26 1.06l2.25 1.68 1.12.85L6 10.06a.72.72 0 0 0-1 0 .7.7 0 0 0-.14.58.74.74 0 0 0 .34.49l4 3a2.74 2.74 0 0 0 1.13.5l.58.09a2.5 2.5 0 0 1 .87.29.83.83 0 0 0 .6 0 3.87 3.87 0 0 0 1.77-1.29 3.8 3.8 0 0 0 .7-2 1 1 0 0 0 0-.42z"
        />
        <path
          fill="#ddf6d1"
          fillRule="evenodd"
          d="m14.81 11.34-.45-.34a6.6 6.6 0 0 0-.51-2.14 5.85 5.85 0 0 1-1.21-2.38c-.16-.53-.27-.72-.74-.73a.74.74 0 0 0-.5.26.73.73 0 0 0-.15.54 4.4 4.4 0 0 0 .06.72c.18.93.37 1.69.39 1.73L7.41 5.79a.75.75 0 0 0-1.11.07c-.31.41-.06.81.26 1.06l2.25 1.69.68.56-3.6-2.76a.75.75 0 0 0-1.11.07c-.31.4-.06.81.26 1.06l2.25 1.69 1.35 1L5.71 8a.72.72 0 0 0-.57-.21.7.7 0 0 0-.53.28.72.72 0 0 0-.12.59.74.74 0 0 0 .38.47l2.25 1.69 1.12.85L6 10a.7.7 0 0 0-1 0 .71.71 0 0 0-.16.6.72.72 0 0 0 .36.51l4 3a4.2 4.2 0 0 0 2 .59 7 7 0 0 0 .8.41 3.23 3.23 0 0 0 2-1.26 4.93 4.93 0 0 0 .86-2.57z"
        />
        <path
          fill="none"
          stroke="#165209"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth=".5"
          d="M14.77 11.39a2.2 2.2 0 0 1-.46-.75 3.7 3.7 0 0 0-.1-.65 2.4 2.4 0 0 0-.36-1.08 5.85 5.85 0 0 1-1.21-2.38c-.16-.53-.27-.72-.74-.73a.74.74 0 0 0-.5.26.73.73 0 0 0-.15.54 4.4 4.4 0 0 0 .06.72c.18.92.37 1.68.39 1.73L7.41 5.84a.76.76 0 0 0-.57-.22.72.72 0 0 0-.54.29.73.73 0 0 0 .26 1l2.25 1.7.68.56-3.6-2.71a.76.76 0 0 0-.57-.22A.71.71 0 0 0 5 7.58l2.25 1.7 1.35 1-2.89-2.19a.73.73 0 0 0-1.1.08c-.31.4-.07.81.26 1.06l2.25 1.68 1.12.85L6 10.06a.72.72 0 0 0-1 0 .7.7 0 0 0-.14.58.74.74 0 0 0 .34.49l4 3a2.74 2.74 0 0 0 1.13.5l.58.09a2.5 2.5 0 0 1 .87.29.83.83 0 0 0 .6 0 3.87 3.87 0 0 0 1.77-1.29 3.8 3.8 0 0 0 .7-2 1 1 0 0 0 0-.42z"
        />
        <path
          fill="none"
          stroke="#165209"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m8.83 2.82-.73.92M5.49 1.62l.07 1.2m1.98-1.19-.65 1.56"
        />
      </g>
    </svg>
  );
}

export function LinkedInSupportIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 15.97"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="8" fill="#fff" />
      <g clipPath="circle(7)">
        <path fill="#d8d8d8" d="M8 14.99a7 7 0 1 0-7-7 7 7 0 0 0 7 7" />
        <path fill="#bba9d1" d="M8 14.99a7 7 0 1 0-7-7 7 7 0 0 0 7 7" />
        <path
          fill="#fef2ff"
          d="M6.56 10.6h-.2c-.23-.08-1.38-.52-2.15-.74a.23.23 0 0 1-.21-.2.7.7 0 0 1 .11-.51.42.42 0 0 1 .36-.16.7.7 0 0 1 .2 0 1.5 1.5 0 0 1 .42.25l.36.25c.13.09.25.17.33.24l.83.33c.12 0 .58.26.56.38s-.53.1-.64.11z"
        />
        <path
          fill="#eae2f3"
          d="M13.55 13.43c-1.2 0-.46.49-1.63.29h-.07a22 22 0 0 1-2.63-.51c-.77-.22-1.52-.5-2.22-.77l-.32-.11c-.7-.26-1.26-.47-1.77-.68l-.2-.07a7 7 0 0 1-.9-.4c-.4-.22-.52-.5-.35-.83A.6.6 0 0 1 4 9.99h.23a22 22 0 0 1 2.84.85h1.19l2.74.15a5 5 0 0 0-2-.81c-.25-.06-.47-.12-.52-.29a.64.64 0 0 1 .23-.71 1.1 1.1 0 0 1 .56-.12 3.4 3.4 0 0 1 .71.08l.35.1a4.3 4.3 0 0 0 .86.18 8.5 8.5 0 0 1 1.42.3 2.43 2.43 0 0 1 2 1.5c-.06-.17 0 0 0-.11l.05-.06h.23c.26 0 .27-.37.28-.37s.24-.14.24 0a30 30 0 0 1-1.66 2.68.21.21 0 0 1-.15.1z"
        />
        <path
          fill="#ecaa96"
          fillRule="evenodd"
          d="M6.16 3.57a1.43 1.43 0 0 0-2 0 1.51 1.51 0 0 0 0 2.09l2.16 2.25 2.22-2.25a1.51 1.51 0 0 0 0-2.09 1.42 1.42 0 0 0-1-.43 1.38 1.38 0 0 0-1 .43l-.17.16z"
        />
        <path
          fill="none"
          stroke="#493d57"
          d="M14.83 10.62a2.66 2.66 0 0 1-.13 1.62 5.3 5.3 0 0 1-1.21 1.68 17.6 17.6 0 0 1-3.86-.07 58 58 0 0 1-6.47-2.7c-.21-.11-.23-.89.36-1.06s2.85.81 3.8.89 2.53.17 3.66.17-1.3-.68-1.69-.82-1.04-.34-1.09-.64.44-.7.8-.7a6.3 6.3 0 0 1 2 .35 13 13 0 0 1 2.44.5A3.1 3.1 0 0 1 15 10.99c.11.19-.29-.45-.17-.37z"
        />
        <path
          fill="none"
          stroke="#493d57"
          d="M4.09 10.08a.75.75 0 0 1 .52-1.09c.4-.08 1.18.41 1.71.91a6.1 6.1 0 0 0 1.9 1.09"
        />
        <path
          fill="none"
          stroke="#77280c"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.24 3.37A1.58 1.58 0 0 0 4 5.6l2.42 2.39 2.41-2.4a1.58 1.58 0 0 0-.43-2.52 1.5 1.5 0 0 0-.69-.16 1.54 1.54 0 0 0-1.11.47l-.18.17z"
        />
      </g>
    </svg>
  );
}

export function LinkedInLoveIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="7.5" fill="#df704d" />
      <path
        fill="#fff"
        d="M8 1a7 7 0 1 1-7 7 7 7 0 0 1 7-7m0-1a8 8 0 1 0 5.66 2.34A8 8 0 0 0 8 0"
      />
      <path
        fill="#fff3f0"
        fillRule="evenodd"
        stroke="#77280c"
        d="M7.71 5A2.64 2.64 0 0 0 4 8.75l4 4 4-4A2.64 2.64 0 0 0 12 5a2.6 2.6 0 0 0-1.85-.77A2.57 2.57 0 0 0 8.3 5l-.3.3z"
      />
      <path
        fill="none"
        d="M11.43 5.18a2 2 0 0 1 .53.63c.9 1.67-.6 2.72-1.54 3.67-.6.61-1.22 1.22-1.85 1.8M5.79 4.81a2.1 2.1 0 0 0-.79.11 1.8 1.8 0 0 0-1 .82A2.6 2.6 0 0 0 3.77 7v.09"
      />
      <path
        fill="none"
        stroke="#77280c"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.71 5A2.6 2.6 0 0 0 4 5a2.66 2.66 0 0 0 0 3.7l4 4 4-4A2.66 2.66 0 0 0 12 5a2.58 2.58 0 0 0-1.85-.78h0A2.58 2.58 0 0 0 8.3 5l-.3.25z"
      />
    </svg>
  );
}

export function LinkedInInsightfulIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="7.5" fill="#f5bb5c" />
      <path
        fill="#fff"
        d="M8 1a7 7 0 1 1-7 7 7 7 0 0 1 7-7m0-1a8 8 0 1 0 5.66 2.34A8 8 0 0 0 8 0"
      />
      <path
        fill="#ffe1b2"
        fillRule="evenodd"
        d="M8.82 13.4h-1.6a.54.54 0 0 1-.54-.54v-1.33h2.68v1.33a.54.54 0 0 1-.54.54"
      />
      <path
        fill="#fcf0de"
        fillRule="evenodd"
        d="M6.69 11.79v-.26a3.1 3.1 0 0 0-.16-1A3.5 3.5 0 0 0 6 9.75a3.24 3.24 0 0 1-1.19-2.49 3.21 3.21 0 0 1 6.42 0A3.38 3.38 0 0 1 10 9.8c.07-.05-.08.06-.18.2a1.7 1.7 0 0 0-.23.47 3.4 3.4 0 0 0-.15 1v.26"
      />
      <path
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M7.46 4.78a2.2 2.2 0 0 0-1.22.65 2.43 2.43 0 0 0-.68 1.22"
      />
      <path
        fill="none"
        stroke="#5d3b01"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.82 13.4h-1.6a.54.54 0 0 1-.54-.54v-1.33h2.68v1.33a.54.54 0 0 1-.54.54"
      />
      <path
        fill="none"
        stroke="#5d3b01"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.68 11.79v-.26a3.4 3.4 0 0 0-.15-1 2 2 0 0 0-.26-.47 2.5 2.5 0 0 0-.37-.43 3.4 3.4 0 0 1-.37-.39 3.16 3.16 0 0 1-.72-2h0a3.21 3.21 0 0 1 6.42 0 3.25 3.25 0 0 1-.73 2 4 4 0 0 1-.57.57l-.2.21a1.7 1.7 0 0 0-.22.47 3.4 3.4 0 0 0-.15 1v.26M4.6 2.64l.61.79m6.21-.8-.61.8M8 1.5v1.26"
      />
    </svg>
  );
}

export function LinkedInFunnyIcon({ size = 16, className }: ReactionIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={className}
    >
      <circle cx="8" cy="8" r="7.5" fill="#44bfd3" stroke="#fff" />
      <circle cx="8" cy="8" r="5" fill="#d5f9fe" stroke="#104e58" />
      <path
        fill="#2199ac"
        d="M10.1 8.6H5.9c-.29 0-.5.26-.41.52.33.94.98 2.18 2.51 2.18s2.18-1.24 2.51-2.18c.09-.26-.12-.52-.41-.52"
      />
      <path fill="#d5f9fe" d="M8 9.8c-.79 0-2 .5-1.5 1s.98.49 1.5.5c.45.01 1 0 1.5-.5s-.74-1-1.5-1" />
      <path
        fill="#104e58"
        d="M10.12 8.3H5.88c-.47 0-.83.47-.66.93.15.4.38.96.81 1.43.44.48 1.08.84 1.97.84s1.52-.36 1.97-.84c.43-.46.66-1.02.81-1.43a.69.69 0 0 0-.66-.93M8 11c-1.47 0-2.03-1.16-2.31-1.94-.05-.13.05-.26.19-.26h4.24c.14 0 .23.13.19.26C10.03 9.83 9.47 11 8 11M4.87 6.63l-.07.1.32.37.14-.08c.57-.32 1.24-.42 1.88-.28l.2-.44c-.78-.58-1.88-.43-2.47.34zm6.32.25.2-.15-.07-.1c-.59-.77-1.69-.92-2.47-.34l.15.2-.15-.2.2.44c.64-.13 1.31-.03 1.88.28l.14.08.32-.37-.2.15z"
      />
    </svg>
  );
}
