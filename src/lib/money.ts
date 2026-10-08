export const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(n) || 0);

export const EXPENSE_CATEGORIES = ["food", "rent", "bills", "transport", "shopping", "fun", "debt", "other"];
export const INCOME_CATEGORIES = ["salary", "freelance", "gift", "other"];
