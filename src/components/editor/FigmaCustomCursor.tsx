import { useEffect, useState } from "react";

export function FigmaCustomCursor() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [isAlt, setIsAlt] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isTextInput, setIsTextInput] = useState(false);
  const [isClicking, setIsClicking] = useState(false);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      setIsVisible(true);
      setIsAlt(e.altKey);

      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable ||
        Boolean(target?.closest("[contenteditable='true']"));
      setIsTextInput(Boolean(isInput));
    };

    const handlePointerDown = () => setIsClicking(true);
    const handlePointerUp = () => setIsClicking(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt" || e.altKey) {
        setIsAlt(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt" || !e.altKey) {
        setIsAlt(false);
      }
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
      setIsAlt(false);
      setIsClicking(false);
    };

    const handleMouseEnter = () => {
      setIsVisible(true);
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleMouseLeave);
    document.documentElement.addEventListener("mouseleave", handleMouseLeave);
    document.documentElement.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleMouseLeave);
      document.documentElement.removeEventListener("mouseleave", handleMouseLeave);
      document.documentElement.removeEventListener("mouseenter", handleMouseEnter);
    };
  }, []);

  if (!pos || !isVisible || isTextInput) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        transform: `translate3d(${pos.x - 3}px, ${pos.y - 3}px, 0) scale(${isClicking ? 0.9 : 1})`,
        transition: "transform 75ms cubic-bezier(0.2, 0, 0.2, 1)",
        pointerEvents: "none",
        zIndex: 999999,
        willChange: "transform",
      }}
    >
      {isAlt ? (
        // Alt-held Double Cursor (1 Solid Black + 1 White/Border offset behind)
        <svg
          width="34"
          height="34"
          viewBox="0 0 34 34"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
        >
          {/* Back White/Border Arrow (Offset +7px, +7px) */}
          <g transform="translate(7, 7)">
            <path
              d="M3 3L17.5 8.5L11.5 11.5L8.5 17.5L3 3Z"
              fill="#ffffff"
              stroke="#09090b"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
          {/* Front Solid Black Arrow */}
          <g transform="translate(0, 0)">
            <path
              d="M3 3L17.5 8.5L11.5 11.5L8.5 17.5L3 3Z"
              fill="#09090b"
              stroke="#ffffff"
              strokeWidth="1.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        </svg>
      ) : (
        // Exact shadcn.io / Figma Precision Tilted White Arrow with Dark Border
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ filter: "drop-shadow(0 1.5px 3px rgba(0,0,0,0.25))" }}
        >
          <path
            d="M3 3L17.5 8.5L11.5 11.5L8.5 17.5L3 3Z"
            fill="#ffffff"
            stroke="#09090b"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
    </div>
  );
}
