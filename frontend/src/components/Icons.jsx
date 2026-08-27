const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconScan(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" {...base} {...props}>
      <path d="M3 9V5a2 2 0 0 1 2-2h4" />
      <path d="M21 9V5a2 2 0 0 0-2-2h-4" />
      <path d="M3 15v4a2 2 0 0 0 2 2h4" />
      <path d="M21 15v4a2 2 0 0 1-2 2h-4" />
      <path d="M7 12h10" />
    </svg>
  );
}

export function IconPlay(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" {...base} fill="currentColor" stroke="none" {...props}>
      <path d="M6 4.5v15l14-7.5-14-7.5Z" />
    </svg>
  );
}

export function IconClapper(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" {...base} {...props}>
      <path d="M3 9.5 5 4h13l2 5.5" />
      <rect x="3" y="9.5" width="17" height="10.5" rx="1.5" />
      <path d="m6 9.5 1.5-4.6M11 9.5l1.5-4.6M16 9.5l1.5-4.6" />
    </svg>
  );
}

export function IconArrowUpRight(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" {...base} {...props}>
      <path d="M7 17 17 7" />
      <path d="M8 7h9v9" />
    </svg>
  );
}

export function IconArrowLeft(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" {...base} {...props}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </svg>
  );
}

export function IconArrowRight(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" {...base} {...props}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function IconInfo(props) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function IconPause(props) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" {...base} fill="currentColor" stroke="none" {...props}>
      <rect x="6" y="4.5" width="4" height="15" rx="1" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" />
    </svg>
  );
}

export function IconCheck(props) {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" {...base} strokeWidth={2.4} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
