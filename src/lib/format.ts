export const formatCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export const formatNumber = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

export function formatAcres(acres: number) {
  return `${formatNumber.format(acres)} ac`;
}

export function formatMiles(miles: number) {
  return `${formatNumber.format(miles)} mi`;
}
