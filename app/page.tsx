import { fetchCategories } from "@/lib/quizzdle-api";
import { HomeView } from "@/components/HomeView";

export default async function Home() {
  const categories = await fetchCategories();
  return <HomeView categories={categories} />;
}
