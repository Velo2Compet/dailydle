import { fetchCategories } from "@/lib/quizzdle-api";
import { CategoriesView } from "@/components/CategoriesView";

export default async function CategoriesPage() {
  const categories = await fetchCategories();
  return <CategoriesView categories={categories} />;
}
