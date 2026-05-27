const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DNP_RE = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])-\d{4}$/;

export function isDnpString(s: string): boolean {
  return DNP_RE.test(s);
}

export function todayDnp(d: Date = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}

export function dnpToTitle(dnp: string): string {
  if (!isDnpString(dnp)) throw new Error(`Not a DNP string: '${dnp}'. Expected MM-DD-YYYY.`);
  const [mm, dd, yyyy] = dnp.split("-").map(Number);
  return `${MONTHS[mm - 1]} ${dd}${ordinal(dd)}, ${yyyy}`;
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
