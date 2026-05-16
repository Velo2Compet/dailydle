import {
  fetchCategories,
  fetchParentCategoriesWithChildren,
  filterRegisteredCollections,
} from "@/lib/quizzdle-api";
import { HomeView } from "@/components/HomeView";

// Force dynamic rendering (blockchain RPC calls can't run at build time)
export const dynamic = "force-dynamic";

export default async function Home() {
  const [allCategories, parents] = await Promise.all([
    fetchCategories(),
    fetchParentCategoriesWithChildren(),
  ]);
  // Only show collections that are registered in the smart contract
  const categories = await filterRegisteredCollections(allCategories);
  return <HomeView categories={categories} parents={parents} />;
}
