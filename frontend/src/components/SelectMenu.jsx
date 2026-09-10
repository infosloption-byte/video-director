import { useEffect, useRef, useState } from "react";
import "./SelectMenu.css";

export default function SelectMenu({ label, value, options = [], onChange, className = "", ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const normalizedOptions = options.map((option) => typeof option === "object" ? option : { value: option, label: option });
  const selected = normalizedOptions.find((option) => String(option.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className={`select-menu ${className}`} ref={rootRef}>
      {label && <span className="select-menu__label">{label}</span>}
      <button
        type="button"
        className={`select-menu__trigger ${open ? "is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || label}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="select-menu__value">{selected?.label ?? String(value ?? "")}</span>
        <span className="select-menu__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="select-menu__menu" role="listbox" aria-label={ariaLabel || label}>
          {normalizedOptions.map((option) => {
            const selectedOption = String(option.value) === String(value);
            return (
              <button
                key={String(option.value)}
                type="button"
                role="option"
                aria-selected={selectedOption}
                className={`select-menu__option ${selectedOption ? "is-selected" : ""}`}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selectedOption && <span className="select-menu__check" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
