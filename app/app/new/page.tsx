import NewRecapForm from "@/components/NewRecapForm";
import { env } from "@/lib/env";
import { GUEST_MODE } from "@/lib/guest";

export const metadata = { title: "New recap" };

export default function NewRecapPage() {
  return <NewRecapForm youtube={env.youtubeEnabled()} guest={GUEST_MODE} />;
}
