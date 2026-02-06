import { fetchCategories, filterRegisteredCollections } from "@/lib/quizzdle-api";
import { HomeView } from "@/components/HomeView";

export default async function Home() {
  const allCategories = await fetchCategories();
  // Only show collections that are registered in the smart contract
  const categories = await filterRegisteredCollections(allCategories);
  return <HomeView categories={categories} />;
}
