const SECTIONS = [
  { href: "/admin/payments", label: "Тойм" },
  { href: "/admin/payments/invoices", label: "Нэхэмжлэл" },
  { href: "/admin/payments/transactions", label: "Гүйлгээ" },
  { href: "/admin/payments/subscriptions", label: "Захиалга" },
  { href: "/admin/payments/entitlements", label: "Эрхийн багц" },
  { href: "/admin/payments/trace", label: "Хэрэглэгчийн трайс" },
  { href: "/admin/payments/diagnostics", label: "QPay diagnostics" },
] as const;

/**
 * Secondary in-page navigation for the Admin Payment Center. Reuses the
 * exact tab visual language already shipped on /admin/payments (status
 * filter pills) rather than introducing a new nav pattern — this just
 * generalizes it across the whole payment module.
 */
export function PaymentCenterTabs({ active }: { active: string }) {
  return (
    <div className="mb-5 flex flex-wrap gap-2">
      {SECTIONS.map((section) => (
        <a
          key={section.href}
          href={section.href}
          className={
            section.href === active
              ? "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              : "rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted"
          }
        >
          {section.label}
        </a>
      ))}
    </div>
  );
}
