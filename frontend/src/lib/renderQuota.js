export function quotaView(account, limitReached = false) {
  const limit = Math.max(0, Number(account?.plan?.rendersPerMonth || 0));
  const used = Math.max(0, Number(account?.used || 0));
  const remaining = Math.max(0, Number(account?.remaining ?? limit - used));
  const percent = limit ? Math.min(100, Math.round(used / limit * 100)) : 0;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(account?.month || "") ? account.month : null;
  const resetAt = month
    ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString()
    : null;
  return {
    limit, used, remaining, percent,
    exhausted: remaining === 0 && Boolean(account),
    blocked: Boolean(limitReached),
    approaching: percent >= 80 && remaining > 0,
    resetAt,
  };
}
