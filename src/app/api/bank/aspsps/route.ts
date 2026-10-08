import { eb, handle } from "@/lib/enablebanking";

type Aspsp = { name: string; country: string; logo?: string };

// UK banks available for personal accounts.
export const GET = handle(async () => {
  const data = await eb<{ aspsps: Aspsp[] }>("/aspsps?country=GB&psu_type=personal&service=AIS");
  return data.aspsps.map(({ name, country, logo }) => ({ name, country, logo }));
});
