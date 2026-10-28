import NewRecapForm from "@/components/NewRecapForm";
import { env } from "@/lib/env";

export const metadata = { title: "New recap" };

export default function NewRecapPage() {
  return <NewRecapForm youtube={env.youtubeEnabled()} />;
}
