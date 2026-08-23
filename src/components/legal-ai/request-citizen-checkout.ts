export type CitizenCheckoutView = {
  qrImage: string | null;
  shortUrl: string | null;
  amountMnt: number;
  planCode: string;
};

export async function requestCitizenCheckout(input?: {
  enabled?: boolean;
}): Promise<{ view: CitizenCheckoutView | null; error?: string }> {
  if (input?.enabled === false) {
    return { view: null, error: "Төлбөр төлөхийн тулд нэвтэрнэ үү." };
  }

  try {
    const response = await fetch("/api/citizen/billing/checkout", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode: "CITIZEN_BASIC" }),
    });
    const data = (await response.json()) as {
      error?: string;
      qrImage?: string | null;
      shortUrl?: string | null;
      amountMnt?: number;
      planCode?: string;
    };
    if (!response.ok) {
      return {
        view: null,
        error: data.error ?? "Төлбөрийн нэхэмжлэл үүсгэж чадсангүй.",
      };
    }
    return {
      view: {
        qrImage: data.qrImage ?? null,
        shortUrl: data.shortUrl ?? null,
        amountMnt: data.amountMnt ?? 0,
        planCode: data.planCode ?? "CITIZEN_BASIC",
      },
    };
  } catch {
    return { view: null, error: "Төлбөрийн нэхэмжлэл үүсгэж чадсангүй." };
  }
}
